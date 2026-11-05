import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

vi.mock('@/lib/require-role', () => ({ requireAdminRole: vi.fn() }));
vi.mock('@/lib/admin/reauth', () => ({ verifySensitiveReauth: vi.fn() }));
vi.mock('@/lib/backup', () => ({
  createSiteBackupFromData: vi.fn(async () => ({})),
  deleteBackupFile: vi.fn(),
  listSiteBackups: vi.fn(),
  readBackupFile: vi.fn(),
}));
vi.mock('@/lib/site-data', () => ({
  getSiteData: vi.fn(async () => ({ pages: [] })),
  saveSiteData: vi.fn(async () => ({})),
}));
vi.mock('@/lib/validation', () => ({
  parseSiteData: vi.fn(() => ({ success: true, data: { pages: [] } })),
}));

import { verifySensitiveReauth } from '@/lib/admin/reauth';
import { readBackupFile } from '@/lib/backup';
import { saveSiteData } from '@/lib/site-data';
import { requireAdminRole } from '@/lib/require-role';
import { POST } from './route';

const owner = { ok: true as const, username: 'owner', role: 'owner' as const, grants: [] };

function restore(body: unknown, headers?: Record<string, string>) {
  return new NextRequest('http://t/api/backup', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json', ...headers },
  });
}

describe('POST /api/backup restore', () => {
  beforeEach(() => {
    vi.mocked(requireAdminRole).mockResolvedValue(owner);
    vi.mocked(verifySensitiveReauth).mockResolvedValue(true);
    vi.mocked(readBackupFile).mockResolvedValue('{"pages":[]}');
    delete process.env.BACKUP_CRON_SECRET;
  });

  it('rejects restore without a valid password', async () => {
    vi.mocked(verifySensitiveReauth).mockResolvedValue(false);
    const res = await POST(restore({ action: 'restore', file: 'site.json' }));
    expect(res.status).toBe(403);
    expect(readBackupFile).not.toHaveBeenCalled();
  });

  it('does not let the cron secret restore', async () => {
    process.env.BACKUP_CRON_SECRET = 'cron-secret';
    vi.mocked(requireAdminRole).mockResolvedValue({
      ok: false,
      response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    });
    const res = await POST(
      restore({ action: 'restore', file: 'site.json', confirmPassword: 'pw' }, { authorization: 'Bearer cron-secret' }),
    );
    expect(res.status).toBe(401);
    expect(readBackupFile).not.toHaveBeenCalled();
  });

  it('restores when reauth passes', async () => {
    const res = await POST(
      restore({ action: 'restore', file: 'site.json', confirmPassword: 'pw', totp: '222222' }),
    );
    expect(res.status).toBe(200);
    expect(verifySensitiveReauth).toHaveBeenCalledWith(expect.objectContaining({ username: 'owner' }), {
      password: 'pw',
      totp: '222222',
    });
    expect(saveSiteData).toHaveBeenCalled();
  });
});
