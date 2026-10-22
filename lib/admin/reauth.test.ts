import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/auth', () => ({ verifyPassword: vi.fn((p: string) => p === 'env-pw') }));
vi.mock('@/lib/admin-users', () => ({
  getAdminUserByUsername: vi.fn(),
  verifyPasswordHash: vi.fn(async (p: string) => p === 'own-pw'),
}));
vi.mock('@/lib/totp', () => ({
  getTotpSecret: vi.fn(),
  verifyTotp: vi.fn((secret: string, token: string) => {
    return (secret === 'GLOBAL' && token === '111111') || (secret === 'PERSONAL' && token === '222222');
  }),
}));

import { getAdminUserByUsername } from '@/lib/admin-users';
import { getTotpSecret, verifyTotp } from '@/lib/totp';
import { resolveActorTotpSecret, verifyCurrentUserPassword, verifySensitiveReauth } from './reauth';

describe('verifyCurrentUserPassword', () => {
  beforeEach(() => vi.mocked(getAdminUserByUsername).mockReset());

  it('db user must use own password, env password rejected', async () => {
    vi.mocked(getAdminUserByUsername).mockResolvedValue({ username: 'op', passwordHash: 'h' } as never);
    expect(await verifyCurrentUserPassword({ username: 'op', role: 'operator' }, 'env-pw')).toBe(false);
    expect(await verifyCurrentUserPassword({ username: 'op', role: 'operator' }, 'own-pw')).toBe(true);
  });

  it('env admin uses ADMIN_PASSWORD', async () => {
    vi.mocked(getAdminUserByUsername).mockResolvedValue(null);
    expect(await verifyCurrentUserPassword({ username: 'admin', role: 'owner' }, 'env-pw')).toBe(true);
  });

  it('unknown non-admin identity is rejected', async () => {
    vi.mocked(getAdminUserByUsername).mockResolvedValue(null);
    expect(await verifyCurrentUserPassword({ username: 'ghost', role: 'editor' }, 'env-pw')).toBe(false);
  });
});

describe('verifySensitiveReauth', () => {
  beforeEach(() => {
    vi.mocked(getAdminUserByUsername).mockReset();
    vi.mocked(getTotpSecret).mockReset();
    vi.mocked(verifyTotp).mockClear();
  });

  it('file user with 2FA off ignores the global secret', async () => {
    vi.mocked(getAdminUserByUsername).mockResolvedValue({ username: 'op', passwordHash: 'h' } as never);
    vi.mocked(getTotpSecret).mockResolvedValue({ secret: 'GLOBAL', source: 'env' });
    expect(await verifySensitiveReauth({ username: 'op', role: 'operator' }, { password: 'own-pw' })).toBe(true);
    expect(getTotpSecret).not.toHaveBeenCalled();
    expect(await resolveActorTotpSecret({ username: 'op', role: 'operator' })).toBeNull();
  });

  it('file user with 2FA on must send their own code', async () => {
    vi.mocked(getAdminUserByUsername).mockResolvedValue({
      username: 'op',
      passwordHash: 'h',
      totp: { secret: 'PERSONAL' },
    } as never);
    expect(await verifySensitiveReauth({ username: 'op', role: 'operator' }, { password: 'own-pw' })).toBe(false);
    expect(
      await verifySensitiveReauth({ username: 'op', role: 'operator' }, { password: 'own-pw', totp: '111111' }),
    ).toBe(false);
    expect(
      await verifySensitiveReauth({ username: 'op', role: 'operator' }, { password: 'own-pw', totp: '222222' }),
    ).toBe(true);
    expect(getTotpSecret).not.toHaveBeenCalled();
  });

  it('env identity uses the global secret', async () => {
    vi.mocked(getAdminUserByUsername).mockResolvedValue(null);
    vi.mocked(getTotpSecret).mockResolvedValue({ secret: 'GLOBAL', source: 'env' });
    const access = { username: 'admin', role: 'owner' as const };
    expect(await verifySensitiveReauth(access, { password: 'env-pw' })).toBe(false);
    expect(await verifySensitiveReauth(access, { password: 'env-pw', totp: '222222' })).toBe(false);
    expect(await verifySensitiveReauth(access, { password: 'env-pw', totp: '111111' })).toBe(true);
    expect(await resolveActorTotpSecret(access)).toEqual({ secret: 'GLOBAL', source: 'global' });
  });

  it('env identity with no global secret is password only', async () => {
    vi.mocked(getAdminUserByUsername).mockResolvedValue(null);
    vi.mocked(getTotpSecret).mockResolvedValue(null);
    expect(await verifySensitiveReauth({ username: 'admin', role: 'legacy' }, { password: 'env-pw' })).toBe(true);
  });

  it('rejects a bad password even when the code is valid', async () => {
    vi.mocked(getAdminUserByUsername).mockResolvedValue({
      username: 'op',
      passwordHash: 'h',
      totp: { secret: 'PERSONAL' },
    } as never);
    expect(
      await verifySensitiveReauth({ username: 'op', role: 'operator' }, { password: 'nope', totp: '222222' }),
    ).toBe(false);
    expect(verifyTotp).not.toHaveBeenCalled();
  });
});
