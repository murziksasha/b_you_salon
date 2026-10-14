import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/admin-users', () => ({ listAdminUsers: vi.fn() }));

import { listAdminUsers } from '@/lib/admin-users';
import { isEnvLoginAllowed } from './env-login';

const owner = [{ id: '1', username: 'o', role: 'owner', createdAt: '', totpEnabled: false }] as never;

describe('isEnvLoginAllowed', () => {
  beforeEach(() => vi.mocked(listAdminUsers).mockResolvedValue([]));
  afterEach(() => {
    delete process.env.ADMIN_ENV_LOGIN;
    delete process.env.ADMIN_BREAKGLASS;
  });

  it('defaults to always (backward compatible)', async () => {
    vi.mocked(listAdminUsers).mockResolvedValue(owner);
    expect(await isEnvLoginAllowed()).toBe(true);
  });

  it('auto: allowed until an enabled owner exists', async () => {
    process.env.ADMIN_ENV_LOGIN = 'auto';
    expect(await isEnvLoginAllowed()).toBe(true);
    vi.mocked(listAdminUsers).mockResolvedValue(owner);
    expect(await isEnvLoginAllowed()).toBe(false);
  });

  it('breakglass requires ADMIN_BREAKGLASS=1; off never', async () => {
    process.env.ADMIN_ENV_LOGIN = 'breakglass';
    expect(await isEnvLoginAllowed()).toBe(false);
    process.env.ADMIN_BREAKGLASS = '1';
    expect(await isEnvLoginAllowed()).toBe(true);
    process.env.ADMIN_ENV_LOGIN = 'off';
    expect(await isEnvLoginAllowed()).toBe(false);
  });
});
