import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/headers', () => ({
  cookies: vi.fn(async () => ({
    get: () => undefined,
    set: () => undefined,
    delete: () => undefined,
  })),
}));

const { verifyPassword } = await import('./auth');

describe('verifyPassword', () => {
  const prev = process.env.ADMIN_PASSWORD;

  afterEach(() => {
    if (prev === undefined) delete process.env.ADMIN_PASSWORD;
    else process.env.ADMIN_PASSWORD = prev;
  });

  it('returns false when ADMIN_PASSWORD is not set', () => {
    delete process.env.ADMIN_PASSWORD;
    expect(verifyPassword('anything')).toBe(false);
  });

  it('returns false for empty password', () => {
    process.env.ADMIN_PASSWORD = 'secret';
    expect(verifyPassword('')).toBe(false);
  });

  it('returns true for correct password', () => {
    process.env.ADMIN_PASSWORD = 'secret';
    expect(verifyPassword('secret')).toBe(true);
  });

  it('returns false for wrong password', () => {
    process.env.ADMIN_PASSWORD = 'secret';
    expect(verifyPassword('wrong')).toBe(false);
  });

  it('returns false when lengths differ', () => {
    process.env.ADMIN_PASSWORD = 'ab';
    expect(verifyPassword('abc')).toBe(false);
  });
});
