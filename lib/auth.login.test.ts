import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/headers', () => ({ cookies: vi.fn() }));
vi.mock('./admin-sessions', () => ({ isSessionAllowed: vi.fn(async () => true) }));
vi.mock('./admin-users', () => ({
  hasMultiUserMode: vi.fn(),
  getAdminUserByUsername: vi.fn(async () => null),
  verifyPasswordHash: vi.fn(async () => false),
  listAdminUsers: vi.fn(async () => []),
}));

import { hasMultiUserMode, listAdminUsers } from './admin-users';
import { authenticateLogin } from './auth';

describe('authenticateLogin env password modes', () => {
  beforeEach(() => {
    process.env.ADMIN_PASSWORD = 'env-password';
    vi.mocked(hasMultiUserMode).mockResolvedValue(true);
    vi.mocked(listAdminUsers).mockResolvedValue([
      { id: '1', username: 'boss', role: 'owner', createdAt: '', totpEnabled: false },
    ]);
  });
  afterEach(() => {
    delete process.env.ADMIN_ENV_LOGIN;
    delete process.env.ADMIN_PASSWORD;
  });

  it('always (default): env password logs in as owner', async () => {
    const r = await authenticateLogin({ password: 'env-password' });
    expect(r.ok && r.claims.role).toBe('owner');
  });

  it('auto with an owner present: env password rejected', async () => {
    process.env.ADMIN_ENV_LOGIN = 'auto';
    expect((await authenticateLogin({ password: 'env-password' })).ok).toBe(false);
    expect((await authenticateLogin({ password: 'env-password', username: 'admin' })).ok).toBe(false);
  });

  it('single-password mode keeps legacy role', async () => {
    vi.mocked(hasMultiUserMode).mockResolvedValue(false);
    const r = await authenticateLogin({ password: 'env-password' });
    expect(r.ok && r.claims.role).toBe('legacy');
  });
});
