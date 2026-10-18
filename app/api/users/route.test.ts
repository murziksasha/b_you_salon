import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

vi.mock('@/lib/require-role', () => ({ requireAdminRole: vi.fn() }));
vi.mock('@/lib/admin/reauth', () => ({ verifyCurrentUserPassword: vi.fn() }));
vi.mock('@/lib/api/audit', () => ({ safeAudit: vi.fn() }));
vi.mock('@/lib/admin-users', () => ({
  listAdminUsers: vi.fn(async () => []),
  createAdminUser: vi.fn(async (u: { username: string; role: string }) => ({ id: '1', ...u })),
  updateAdminUser: vi.fn(async () => ({ ok: true })),
  deleteAdminUser: vi.fn(async () => ({ ok: true })),
  setUserTotp: vi.fn(async () => ({ ok: true })),
}));
vi.mock('@/lib/admin-sessions', () => ({ revokeSessionsByUsername: vi.fn(async () => 0) }));

import { requireAdminRole } from '@/lib/require-role';
import { verifyCurrentUserPassword } from '@/lib/admin/reauth';
import { listAdminUsers, setUserTotp } from '@/lib/admin-users';
import { DELETE, GET, PATCH, POST } from './route';

const owner = { ok: true as const, username: 'owner', role: 'owner' as const, grants: [] };

function req(method: string, body?: unknown) {
  return new NextRequest('http://t/api/users', {
    method,
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  });
}

describe('/api/users', () => {
  beforeEach(() => {
    vi.mocked(requireAdminRole).mockResolvedValue(owner);
    vi.mocked(verifyCurrentUserPassword).mockResolvedValue(true);
  });

  it('returns gate response when forbidden', async () => {
    vi.mocked(requireAdminRole).mockResolvedValue({
      ok: false,
      response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }),
    });
    expect((await GET(req('GET'))).status).toBe(403);
  });

  it('rejects invalid body with 400 validation', async () => {
    const res = await POST(req('POST', { username: 'x', password: 'short' }));
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe('validation');
  });

  it('requires re-auth password', async () => {
    vi.mocked(verifyCurrentUserPassword).mockResolvedValue(false);
    const res = await POST(req('POST', { username: 'bob', password: 'longenough', confirmPassword: 'x' }));
    expect(res.status).toBe(403);
  });

  it('creates a user (ownerPassword alias accepted)', async () => {
    const res = await POST(req('POST', { username: 'bob', password: 'longenough', ownerPassword: 'pw' }));
    expect(res.status).toBe(200);
    expect(verifyCurrentUserPassword).toHaveBeenCalledWith(expect.objectContaining({ username: 'owner' }), 'pw');
  });

  it('deletes a user', async () => {
    expect((await DELETE(req('DELETE', { id: 'u1', confirmPassword: 'pw' }))).status).toBe(200);
  });

  it('owner can reset a user 2FA', async () => {
    vi.mocked(listAdminUsers).mockResolvedValue([
      { id: 'u1', username: 'bob', role: 'operator', createdAt: '', totpEnabled: true },
    ]);
    const res = await PATCH(req('PATCH', { id: 'u1', resetTotp: true, confirmPassword: 'pw' }));
    expect(res.status).toBe(200);
    expect(setUserTotp).toHaveBeenCalledWith('bob', null);
  });
});
