import { createHash, timingSafeEqual } from 'crypto';

/**
 * Constant-time string comparison that does not leak length or character differences.
 * Hashes both strings to fixed-size SHA-256 digests before comparison.
 */
export function timingSafeCompare(a?: string | null, b?: string | null): boolean {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  if (!a || !b) return false;
  const hashA = createHash('sha256').update(a).digest();
  const hashB = createHash('sha256').update(b).digest();
  return timingSafeEqual(hashA, hashB);
}

