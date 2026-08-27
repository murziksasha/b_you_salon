import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createSessionToken, isValidSession } from './session';

describe('session', () => {
  const prevSecret = process.env.SESSION_SECRET;

  beforeEach(() => {
    process.env.SESSION_SECRET = 'test-secret-key-for-sessions';
  });

  afterEach(() => {
    if (prevSecret === undefined) delete process.env.SESSION_SECRET;
    else process.env.SESSION_SECRET = prevSecret;
  });

  it('creates a valid signed token', async () => {
    const token = await createSessionToken();
    expect(token.split('.')).toHaveLength(3);
    expect(await isValidSession(token)).toBe(true);
  });

  it('rejects missing token', async () => {
    expect(await isValidSession(undefined)).toBe(false);
    expect(await isValidSession('')).toBe(false);
  });

  it('rejects tampered signature', async () => {
    const token = await createSessionToken();
    const parts = token.split('.');
    parts[2] = '0'.repeat(parts[2].length);
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
});
