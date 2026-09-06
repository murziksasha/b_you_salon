import { AsyncLocalStorage } from 'node:async_hooks';
import path from 'node:path';

/**
 * In-process per-file mutex for read-modify-write JSON stores.
 * Uses a promise chain (no flock) so it works on Windows.
 * Re-entrant for the same file in the same async context to allow
 * getSiteData() → saveSiteData() while an outer lock is held.
 */

const held = new AsyncLocalStorage<Set<string>>();
const tails = new Map<string, Promise<void>>();

export function mutexKey(filePath: string): string {
  const resolved = path.resolve(filePath);
  return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
}

export async function withFileMutex<T>(filePath: string, fn: () => Promise<T>): Promise<T> {
  const key = mutexKey(filePath);
  const current = held.getStore();
  if (current?.has(key)) {
    return fn();
  }

  let release!: () => void;
  const gate = new Promise<void>(resolve => {
    release = resolve;
  });
  const prev = tails.get(key) ?? Promise.resolve();
  const chained = prev.then(
    () => gate,
    () => gate,
  );
  tails.set(key, chained);

  try {
    await prev;
  } catch {
    // Previous holder failed; this caller still runs.
  }

  const nextHeld = new Set(current);
  nextHeld.add(key);
  try {
    return await held.run(nextHeld, fn);
  } finally {
    release();
    if (tails.get(key) === chained) {
      tails.delete(key);
    }
  }
}
