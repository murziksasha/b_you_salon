import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./require-admin-ip', () => ({
  assertAdminIp: vi.fn(),
}));

vi.mock('./auth', () => ({
  getSession: vi.fn(),
  getSessionClaims: vi.fn(),
}));

vi.mock('./admin-users', () => ({
  hasMultiUserMode: vi.fn(),
  getAdminUserByUsername: vi.fn(),
}));

import { assertAdminIp } from './require-admin-ip';
import { getSession, getSessionClaims } from './auth';
import { getAdminUserByUsername, hasMultiUserMode } from './admin-users';
import { requireAdminRole, resolveAdminAccess } from './require-role';

describe('require-role', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('resolveAdminAccess', () => {
    it('resolves user from database in multi-user mode', async () => {
      vi.mocked(hasMultiUserMode).mockResolvedValue(true);
      vi.mocked(getAdminUserByUsername).mockResolvedValue({
        username: 'natali',
        role: 'editor',
        passwordHash: 'hash',
        createdAt: '2026-01-01',
        grants: ['leads'],
      });

      const access = await resolveAdminAccess('natali');
      expect(access).not.toBeNull();
      expect(access?.username).toBe('natali');
      expect(access?.role).toBe('editor');
      expect(access?.grants).toContain('leads');
    });

    it('falls back to cookie role for owner or legacy if user not in db', async () => {
      vi.mocked(hasMultiUserMode).mockResolvedValue(true);
      vi.mocked(getAdminUserByUsername).mockResolvedValue(null);

      const access = await resolveAdminAccess('admin', 'owner');
      expect(access).not.toBeNull();
      expect(access?.role).toBe('owner');

      const legacyAccess = await resolveAdminAccess('admin', 'legacy');
      expect(legacyAccess?.role).toBe('legacy');

      const unknownAccess = await resolveAdminAccess('unknown', 'operator');
      expect(unknownAccess).toBeNull();
    });

    it('resolves access in single-user mode', async () => {
      vi.mocked(hasMultiUserMode).mockResolvedValue(false);

      const access = await resolveAdminAccess('admin', 'editor');
      expect(access?.role).toBe('editor');

      const fallback = await resolveAdminAccess('admin', 'invalid');
      expect(fallback?.role).toBe('legacy');
    });
  });

  describe('requireAdminRole', () => {
    it('returns error if IP check fails', async () => {
      vi.mocked(assertAdminIp).mockResolvedValue({ ok: false, status: 403, error: 'IP Forbidden' });

      const gate = await requireAdminRole();
      expect(gate.ok).toBe(false);
      if (!gate.ok) {
        expect(gate.response.status).toBe(403);
      }
    });

    it('returns 401 if getSession returns false', async () => {
      vi.mocked(assertAdminIp).mockResolvedValue({ ok: true });
      vi.mocked(getSession).mockResolvedValue(false);

      const gate = await requireAdminRole();
      expect(gate.ok).toBe(false);
      if (!gate.ok) {
        expect(gate.response.status).toBe(401);
      }
    });

    it('returns 403 if action capability is not granted', async () => {
      vi.mocked(assertAdminIp).mockResolvedValue({ ok: true });
      vi.mocked(getSession).mockResolvedValue(true);
      vi.mocked(getSessionClaims).mockResolvedValue({ username: 'operator1', role: 'operator' });
      vi.mocked(hasMultiUserMode).mockResolvedValue(false);

      // 'operator' role does not have 'users'
      const gate = await requireAdminRole('users');
      expect(gate.ok).toBe(false);
      if (!gate.ok) {
        expect(gate.response.status).toBe(403);
      }
    });

    it('returns ok: true if action capability is granted', async () => {
      vi.mocked(assertAdminIp).mockResolvedValue({ ok: true });
      vi.mocked(getSession).mockResolvedValue(true);
      vi.mocked(getSessionClaims).mockResolvedValue({ username: 'admin', role: 'owner' });
      vi.mocked(hasMultiUserMode).mockResolvedValue(false);

      const gate = await requireAdminRole('users');
      expect(gate.ok).toBe(true);
      if (gate.ok) {
        expect(gate.username).toBe('admin');
        expect(gate.role).toBe('owner');
      }
    });
  });
});
