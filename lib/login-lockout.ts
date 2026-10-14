/**
 * Per-username login lockout (in-memory, single instance): after MAX_FAILURES failed logins
 * within WINDOW_MS the username is locked for LOCK_MS, regardless of client IP.
 * Complements the per-IP rate limit in /api/auth. Reset on successful login.
 */
const MAX_FAILURES = 5;
const WINDOW_MS = 15 * 60_000;
const LOCK_MS = 15 * 60_000;

type Entry = { failures: number[]; lockedUntil: number };
const entries = new Map<string, Entry>();

function key(username: string): string {
  return (username || 'admin').trim().toLowerCase() || 'admin';
}

export function lockoutRetryAfterSec(username: string, now = Date.now()): number {
  const e = entries.get(key(username));
  if (!e || e.lockedUntil <= now) return 0;
  return Math.ceil((e.lockedUntil - now) / 1000);
}

/** Record a failure; returns true when this failure triggered a lock. */
export function recordLoginFailure(username: string, now = Date.now()): boolean {
  const k = key(username);
  const e = entries.get(k) || { failures: [], lockedUntil: 0 };
  e.failures = e.failures.filter((t) => now - t < WINDOW_MS);
  e.failures.push(now);
  let locked = false;
  if (e.failures.length >= MAX_FAILURES) {
    e.lockedUntil = now + LOCK_MS;
    e.failures = [];
    locked = true;
  }
  entries.set(k, e);
  return locked;
}

export function resetLoginFailures(username: string): void {
  entries.delete(key(username));
}

export function _resetAllLockouts(): void {
  entries.clear();
}
