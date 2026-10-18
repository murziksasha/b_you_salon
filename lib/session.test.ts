import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createSessionToken, getSessionSecret, isValidSession, parseSession } from './session';

describe('session', () => {
  const prevSecret = process.env.SESSION_SECRET;

  beforeEach(() => {
    process.env.SESSION_SECRET = 'test-secret-key-for-sessions-0123456789';
  });

  afterEach(() => {
    if (prevSecret === undefined) delete process.env.SESSION_SECRET;
    else process.env.SESSION_SECRET = prevSecret;
  });

  it('creates a valid signed token', async () => {
    const token = await createSessionToken();
    expect(token.split('.')).toHaveLength(4);
    expect(await isValidSession(token)).toBe(true);
  });

  it('rejects missing token', async () => {
    expect(await isValidSession(undefined)).toBe(false);
    expect(await isValidSession('')).toBe(false);
  });

  it('rejects tampered signature', async () => {
    const token = await createSessionToken();
    const parts = token.split('.');
    parts[3] = '0'.repeat(parts[3].length);
    expect(await isValidSession(parts.join('.'))).toBe(false);
  });

  it('rejects expired / malformed token', async () => {
    const token = await createSessionToken();
    const [id] = token.split('.');
    const expired = `${id}.${Date.now() - 1000}.deadbeef`;
    expect(await isValidSession(expired)).toBe(false);
  });

  it('rejects token signed with different secret', async () => {
    const token = await createSessionToken();
    process.env.SESSION_SECRET = 'another-secret';
    expect(await isValidSession(token)).toBe(false);
  });

  it('rejects legacy 3-part tokens without claims', async () => {
    const token = await createSessionToken({ username: 'a', role: 'owner' });
    const [id, exp, , sig] = token.split('.');
    expect(await isValidSession(`${id}.${exp}.${sig}`)).toBe(false);
  });

  it('defaults claims to admin/legacy and parses them', async () => {
    const parsed = await parseSession(await createSessionToken());
    expect(parsed.claims).toEqual({ username: 'admin', role: 'legacy' });
  });

  describe('getSessionSecret in production', () => {
    const env = process.env as Record<string, string | undefined>;
    const prevNodeEnv = env.NODE_ENV;
    const prevAdmin = env.ADMIN_PASSWORD;
    const prevFlag = env.ALLOW_LEGACY_SESSION_SECRET;
    beforeEach(() => {
      env.NODE_ENV = 'production';
    });
    afterEach(() => {
      env.NODE_ENV = prevNodeEnv;
      if (prevAdmin === undefined) delete env.ADMIN_PASSWORD;
      else env.ADMIN_PASSWORD = prevAdmin;
      if (prevFlag === undefined) delete env.ALLOW_LEGACY_SESSION_SECRET;
      else env.ALLOW_LEGACY_SESSION_SECRET = prevFlag;
    });

    it('accepts a strong secret', () => {
      expect(getSessionSecret()).toBe('test-secret-key-for-sessions-0123456789');
    });

    it('throws on short or placeholder secret', () => {
      env.SESSION_SECRET = 'short';
      expect(() => getSessionSecret()).toThrow(/SESSION_SECRET/);
      env.SESSION_SECRET = 'byou-dev-session-secret-change-me';
      expect(() => getSessionSecret()).toThrow(/SESSION_SECRET/);
    });

    it('falls back to ADMIN_PASSWORD only with the legacy flag', () => {
      delete env.SESSION_SECRET;
      env.ADMIN_PASSWORD = 'pw';
      expect(() => getSessionSecret()).toThrow();
      env.ALLOW_LEGACY_SESSION_SECRET = 'true';
      expect(getSessionSecret()).toBe('pw');
    });
  });
});
