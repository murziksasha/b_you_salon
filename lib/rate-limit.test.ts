import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { clientKey, rateLimit, rateLimitAdaptive, resetRateLimits } from './rate-limit';

describe('rateLimit', () => {
  const origEnv = process.env;

  beforeEach(() => {
    process.env = { ...origEnv };
    resetRateLimits();
  });

  afterEach(() => {
    process.env = origEnv;
  });

  it('allows up to limit then blocks with retryAfterMs', () => {
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

  it('tracks distinct user identifiers in separate buckets without cross-user denial of service', () => {
    const userOpts = { limit: 2, windowMs: 60_000 };

    // User Alice exhausts her limit
    expect(rateLimit('auth:user:alice', userOpts).allowed).toBe(true);
    expect(rateLimit('auth:user:alice', userOpts).allowed).toBe(true);
    expect(rateLimit('auth:user:alice', userOpts).allowed).toBe(false);

    // User Bob is independent and not blocked
    expect(rateLimit('auth:user:bob', userOpts).allowed).toBe(true);
    expect(rateLimit('auth:user:bob', userOpts).allowed).toBe(true);
    expect(rateLimit('auth:user:bob', userOpts).allowed).toBe(false);
  });

  it('tracks distinct phone numbers in separate buckets', () => {
    const phoneOpts = { limit: 2, windowMs: 600_000 };

    expect(rateLimit('order:phone:+380501111111', phoneOpts).allowed).toBe(true);
    expect(rateLimit('order:phone:+380501111111', phoneOpts).allowed).toBe(true);
    expect(rateLimit('order:phone:+380501111111', phoneOpts).allowed).toBe(false);

    // Separate phone number can still place orders
    expect(rateLimit('order:phone:+380502222222', phoneOpts).allowed).toBe(true);
  });

  it('resets rate limits cleanly on restart', () => {
    const opts = { limit: 1, windowMs: 60_000 };
    expect(rateLimit('test:key', opts).allowed).toBe(true);
    expect(rateLimit('test:key', opts).allowed).toBe(false);

    resetRateLimits();
    expect(rateLimit('test:key', opts).allowed).toBe(true);
  });

  describe('clientKey', () => {
    it('ignores spoofed headers when TRUST_PROXY is not true', () => {
      delete process.env.TRUST_PROXY;
      const req = new Request('http://localhost', {
        headers: {
          'x-real-ip': '1.2.3.4',
          'x-forwarded-for': '5.6.7.8',
        },
      });
      expect(clientKey(req, 'login')).toBe('login:unknown');
    });

    it('uses x-real-ip when TRUST_PROXY is true', () => {
      process.env.TRUST_PROXY = 'true';
      const req = new Request('http://localhost', {
        headers: {
          'x-real-ip': '1.2.3.4',
          'x-forwarded-for': '5.6.7.8',
        },
      });
      expect(clientKey(req, 'login')).toBe('login:1.2.3.4');
    });

    it('falls back to rightmost x-forwarded-for IP when TRUST_PROXY is true', () => {
      process.env.TRUST_PROXY = 'true';
      const req = new Request('http://localhost', {
        headers: {
          'x-forwarded-for': '10.0.0.1, 10.0.0.2, 9.9.9.9',
        },
      });
      expect(clientKey(req, 'contact')).toBe('contact:9.9.9.9');
    });

    it('uses identifier when supplied regardless of headers', () => {
      const req = new Request('http://localhost', {
        headers: { 'x-real-ip': '1.2.3.4' },
      });
      expect(clientKey(req, 'contact', '+380501234567')).toBe('contact:id:+380501234567');
    });
  });

  describe('rateLimitAdaptive', () => {
    it('uses higher global ceiling when IP is untrusted/unknown', () => {
      delete process.env.TRUST_PROXY;
      const req = new Request('http://localhost', {
        headers: { 'x-real-ip': '1.2.3.4' }, // ignored without TRUST_PROXY
      });

      // clientLimit = 2, but globalCeiling defaults to max(16, 60) = 60
      const r1 = rateLimitAdaptive(req, 'api', { clientLimit: 2, windowMs: 60_000 });
      const r2 = rateLimitAdaptive(req, 'api', { clientLimit: 2, windowMs: 60_000 });
      const r3 = rateLimitAdaptive(req, 'api', { clientLimit: 2, windowMs: 60_000 });

      // Allowed because unverified IP uses global ceiling rather than strict single-client limit
      expect(r1.allowed).toBe(true);
      expect(r2.allowed).toBe(true);
      expect(r3.allowed).toBe(true);
    });

    it('uses clientLimit when TRUST_PROXY is true and IP is verified', () => {
      process.env.TRUST_PROXY = 'true';
      const req = new Request('http://localhost', {
        headers: { 'x-real-ip': '1.2.3.4' },
      });

      const r1 = rateLimitAdaptive(req, 'api', { clientLimit: 2, windowMs: 60_000 });
      const r2 = rateLimitAdaptive(req, 'api', { clientLimit: 2, windowMs: 60_000 });
      const r3 = rateLimitAdaptive(req, 'api', { clientLimit: 2, windowMs: 60_000 });

      expect(r1.allowed).toBe(true);
      expect(r2.allowed).toBe(true);
      expect(r3.allowed).toBe(false);
    });
  });
});
