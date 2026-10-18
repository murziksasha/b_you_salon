import { describe, expect, it } from 'vitest';
import { clientKey, rateLimit, resetRateLimits } from './rate-limit';

describe('rateLimit', () => {
  it('allows up to limit then blocks with retryAfterMs', () => {
    resetRateLimits();
    const key = 'test:ip';
    const opts = { limit: 3, windowMs: 60_000 };

    const r1 = rateLimit(key, opts);
    expect(r1.allowed).toBe(true);
    expect(r1.remaining).toBe(2);
    expect(r1.retryAfterMs).toBe(0);

    const r2 = rateLimit(key, opts);
    expect(r2.allowed).toBe(true);
    expect(r2.remaining).toBe(1);

    const r3 = rateLimit(key, opts);
    expect(r3.allowed).toBe(true);
    expect(r3.remaining).toBe(0);

    const r4 = rateLimit(key, opts);
    expect(r4.allowed).toBe(false);
    expect(r4.remaining).toBe(0);
    expect(r4.retryAfterMs).toBeGreaterThan(0);
  });

  describe('clientKey', () => {
    it('uses x-real-ip when available', () => {
      const req = new Request('http://localhost', {
        headers: {
          'x-real-ip': '1.2.3.4',
          'x-forwarded-for': '5.6.7.8',
        },
      });
      expect(clientKey(req, 'login')).toBe('login:1.2.3.4');
    });

    it('falls back to rightmost x-forwarded-for IP', () => {
      const req = new Request('http://localhost', {
        headers: {
          'x-forwarded-for': '10.0.0.1, 10.0.0.2, 9.9.9.9',
        },
      });
      expect(clientKey(req, 'contact')).toBe('contact:9.9.9.9');
    });

    it('falls back to unknown when no IP headers present', () => {
      const req = new Request('http://localhost');
      expect(clientKey(req, 'api')).toBe('api:unknown');
    });
  });
});
