import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

vi.mock('@/lib/require-role', () => ({ requireAdminRole: vi.fn() }));
vi.mock('@/lib/auth', () => ({ verifyPassword: vi.fn() }));
vi.mock('@/lib/api/audit', () => ({ safeAudit: vi.fn() }));
vi.mock('@/lib/admin-users', () => ({
  listAdminUsers: vi.fn(async () => []),
  createAdminUser: vi.fn(async (u: { username: string; role: string }) => ({ id: '1', ...u })),
  updateAdminUser: vi.fn(async () => ({ ok: true })),
  deleteAdminUser: vi.fn(async () => ({ ok: true })),
}));

import { requireAdminRole } from '@/lib/require-role';
import { verifyPassword } from '@/lib/auth';
import { DELETE, GET, POST } from './route';

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
    vi.mocked(verifyPassword).mockReturnValue(true);
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
    vi.mocked(verifyPassword).mockReturnValue(false);
    const res = await POST(req('POST', { username: 'bob', password: 'longenough', confirmPassword: 'x' }));
    expect(res.status).toBe(403);
  });

  it('creates a user (ownerPassword alias accepted)', async () => {
    const res = await POST(req('POST', { username: 'bob', password: 'longenough', ownerPassword: 'pw' }));
    expect(res.status).toBe(200);
    expect(verifyPassword).toHaveBeenCalledWith('pw');
  });

  it('deletes a user', async () => {
    expect((await DELETE(req('DELETE', { id: 'u1', confirmPassword: 'pw' }))).status).toBe(200);
  });
});
