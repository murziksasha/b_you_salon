import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/auth', () => ({ verifyPassword: vi.fn((p: string) => p === 'env-pw') }));
vi.mock('@/lib/admin-users', () => ({
  getAdminUserByUsername: vi.fn(),
  verifyPasswordHash: vi.fn(async (p: string) => p === 'own-pw'),
}));

import { getAdminUserByUsername } from '@/lib/admin-users';
import { verifyCurrentUserPassword } from './reauth';

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
