import { describe, expect, it } from 'vitest';
import { rateLimit, resetRateLimits } from './rate-limit';

describe('rateLimit', () => {
  it('allows up to limit then blocks', () => {
    resetRateLimits();
    const key = 'test:ip';
    const opts = { limit: 3, windowMs: 60_000 };

    expect(rateLimit(key, opts).allowed).toBe(true);
    expect(rateLimit(key, opts).allowed).toBe(true);
    expect(rateLimit(key, opts).allowed).toBe(true);
    expect(rateLimit(key, opts).allowed).toBe(false);
  });
});
