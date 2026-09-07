import { afterEach, describe, expect, it } from 'vitest';
import { signViberPhone, verifyViberPhone, viberRedirectUrl } from './viber-go';

describe('viber-go', () => {
  const prev = process.env.SESSION_SECRET;

  afterEach(() => {
    if (prev === undefined) delete process.env.SESSION_SECRET;
    else process.env.SESSION_SECRET = prev;
  });

  it('round-trips hmac and rejects a bad signature', () => {
    process.env.SESSION_SECRET = 'test-secret-for-viber';
    const digits = '380671234512';
    const sig = signViberPhone(digits);
    expect(sig.length).toBeGreaterThan(10);
    expect(verifyViberPhone(digits, sig)).toBe(true);
    expect(verifyViberPhone(digits, sig.replace(/.$/, sig.endsWith('a') ? 'b' : 'a'))).toBe(false);
    expect(verifyViberPhone('380000000000', sig)).toBe(false);
  });

  it('builds a public redirect URL only with origin + secret', () => {
    process.env.SESSION_SECRET = 'test-secret-for-viber';
    const url = viberRedirectUrl('+380671234512', 'https://beyou.example');
    expect(url).toMatch(/^https:\/\/beyou\.example\/r\/viber\?/);
    expect(url).toContain('p=380671234512');
    expect(viberRedirectUrl('+380671234512', '')).toBeUndefined();
    delete process.env.SESSION_SECRET;
    expect(viberRedirectUrl('+380671234512', 'https://beyou.example')).toBeUndefined();
  });
});
