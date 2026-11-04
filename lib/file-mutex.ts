import { AsyncLocalStorage } from 'node:async_hooks';
import fs from 'node:fs/promises';
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
  const gate = new Promise<void>((resolve) => {
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

export interface ProcessLockData {
  token: string;
  pid: number;
  at: number;
}

export function isPidAlive(pid: number): boolean {
  if (pid <= 0 || !Number.isInteger(pid)) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (err: unknown) {
    const code = (err as NodeJS.ErrnoException)?.code;
    return code === 'EPERM'; // Alive but lacks permission
  }
}

/**
 * Cross-process lock using atomic file creation (`O_CREAT | O_EXCL` via flag `wx`).
 *
 * Composes with `withFileMutex` so concurrent callers in the same process serialize
 * in memory before contending for the file lock.
 *
 * Stale lock handling: recovers safely on dead owner PID or expired lease with compare-and-swap.
 * Uses an owner token and active heartbeat so callers are never stolen mid-flight and cannot
 * release another owner's lock.
 */
export async function withProcessFileMutex<T>(
  filePath: string,
  fn: (lockInfo?: { token: string }) => Promise<T>,
  opts: { timeoutMs?: number; staleMs?: number; heartbeatIntervalMs?: number } = {},
): Promise<T> {
  const timeoutMs = opts.timeoutMs ?? 5000;
  const staleMs = opts.staleMs ?? 10000;
  const heartbeatMs = opts.heartbeatIntervalMs ?? Math.min(2000, Math.floor(staleMs / 3));
  const lockFile = `${filePath}.lock`;
  const ownerToken = `${process.pid}_${Date.now()}_${Math.random().toString(36).slice(2)}`;

  return withFileMutex(filePath, async () => {
    await fs.mkdir(path.dirname(lockFile), { recursive: true }).catch(() => {});
    const start = Date.now();
    let acquired = false;

    while (!acquired) {
      try {
        const payload: ProcessLockData = { token: ownerToken, pid: process.pid, at: Date.now() };
        await fs.writeFile(lockFile, JSON.stringify(payload), { flag: 'wx' });
        acquired = true;
      } catch (err: unknown) {
        const code = (err as NodeJS.ErrnoException)?.code;
        if (code === 'EEXIST') {
          try {
            const raw = await fs.readFile(lockFile, 'utf-8');
            const data = JSON.parse(raw) as ProcessLockData;
            const stat = await fs.stat(lockFile);
            const age = Date.now() - stat.mtimeMs;

            const ownerDead = !isPidAlive(data.pid);
            const expired = age > staleMs;

            if (ownerDead || expired) {
              const currentRaw = await fs.readFile(lockFile, 'utf-8').catch(() => null);
              if (currentRaw) {
                const currentData = JSON.parse(currentRaw) as ProcessLockData;
                if (currentData.token === data.token) {
                  await fs.unlink(lockFile).catch(() => {});
                  continue;
                }
              }
            }
          } catch {
            // lock unlinked concurrently or unreadable, retry
            continue;
          }

          if (Date.now() - start > timeoutMs) {
            throw new Error(`Timed out waiting for process lock on ${filePath}`);
          }

          await new Promise((r) => setTimeout(r, 50));
        } else {
          throw err;
        }
      }
    }

    let heartbeatTimer: NodeJS.Timeout | undefined;
    if (heartbeatMs > 0) {
      heartbeatTimer = setInterval(async () => {
        try {
          const raw = await fs.readFile(lockFile, 'utf-8');
          const data = JSON.parse(raw) as ProcessLockData;
          if (data.token === ownerToken) {
            const now = new Date();
            await fs.utimes(lockFile, now, now).catch(() => {});
          }
        } catch {
          // ignore heartbeat errors
        }
      }, heartbeatMs);
      heartbeatTimer.unref?.();
    }

    try {
      return await fn({ token: ownerToken });
    } finally {
      if (heartbeatTimer) clearInterval(heartbeatTimer);
      try {
        const raw = await fs.readFile(lockFile, 'utf-8');
        const data = JSON.parse(raw) as ProcessLockData;
        if (data.token === ownerToken) {
          await fs.unlink(lockFile).catch(() => {});
        }
      } catch {
        // already unlinked
      }
    }
  });
}
