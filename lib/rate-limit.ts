/**
 * Simple in-memory sliding-window rate limiter.
 * Suitable for single-instance Node deployments.
 */

interface Bucket {
  timestamps: number[];
}

const MAX_BUCKETS = 5_000;
const CLEANUP_INTERVAL_MS = 60_000;
let lastCleanup = Date.now();

const buckets = new Map<string, Bucket>();

export interface RateLimitOptions {
  /** Max requests in the window */
  limit: number;
  /** Window size in milliseconds */
  windowMs: number;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterMs: number;
}

function pruneExpiredBuckets(now: number): void {
  for (const [k, b] of buckets.entries()) {
    // If bucket has no timestamps or oldest is older than 5 minutes, prune
    if (b.timestamps.length === 0 || b.timestamps[b.timestamps.length - 1] < now - 300_000) {
      buckets.delete(k);
    }
  }
}

export function rateLimit(key: string, options: RateLimitOptions): RateLimitResult {
  const now = Date.now();
  const windowStart = now - options.windowMs;

  // Periodic cleanup or cap enforcement to prevent unbounded memory growth
  if (now - lastCleanup > CLEANUP_INTERVAL_MS || buckets.size > MAX_BUCKETS) {
    pruneExpiredBuckets(now);
    lastCleanup = now;
    while (buckets.size >= MAX_BUCKETS) {
      const oldestKey = buckets.keys().next().value;
      if (oldestKey !== undefined) buckets.delete(oldestKey);
      else break;
    }
  }

  let bucket = buckets.get(key);
  if (!bucket) {
    bucket = { timestamps: [] };
    buckets.set(key, bucket);
  }

  bucket.timestamps = bucket.timestamps.filter(t => t > windowStart);

  if (bucket.timestamps.length >= options.limit) {
    const oldest = bucket.timestamps[0] ?? now;
    return {
      allowed: false,
      remaining: 0,
      retryAfterMs: Math.max(0, oldest + options.windowMs - now),
    };
  }

  bucket.timestamps.push(now);
  return {
    allowed: true,
    remaining: options.limit - bucket.timestamps.length,
    retryAfterMs: 0,
  };
}

/** Reset all buckets (for tests). */
export function resetRateLimits(): void {
  buckets.clear();
}

export function clientKey(request: Request, prefix: string): string {
  // Prefer X-Real-IP (set by trusted proxy), fallback to rightmost X-Forwarded-For
  const real = request.headers.get('x-real-ip');
  if (real) return `${prefix}:${real.trim()}`;
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) {
    const parts = forwarded
      .split(',')
      .map(s => s.trim())
      .filter(Boolean);
    const ip = parts[parts.length - 1] || 'unknown';
    return `${prefix}:${ip}`;
  }
  return `${prefix}:unknown`;
}
