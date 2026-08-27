import { NextRequest, NextResponse } from 'next/server';
import { getSession, getSessionClaims } from '@/lib/auth';
import {
  createSiteBackupFromData,
  deleteBackupFile,
  listSiteBackups,
  readBackupFile,
} from '@/lib/backup';
import { assertAdminIp } from '@/lib/require-admin-ip';
import { getSiteData, saveSiteData } from '@/lib/site-data';
import { parseSiteData } from '@/lib/validation';
import { roleCan } from '@/lib/admin-users';

export const dynamic = 'force-dynamic';

function cronAuthorized(request: NextRequest): boolean {
  const secret = process.env.BACKUP_CRON_SECRET;
  if (!secret) return false;
  const auth = request.headers.get('authorization') || '';
  const header = request.headers.get('x-backup-secret') || '';
  return auth === `Bearer ${secret}` || header === secret;
}

async function requireAdminOrCron(request: NextRequest) {
  if (cronAuthorized(request)) return { ok: true as const, via: 'cron' as const };

  const ipGate = await assertAdminIp();
  if (!ipGate.ok) return { ok: false as const, status: ipGate.status, error: ipGate.error };

  const session = await getSession();
  if (!session) return { ok: false as const, status: 401, error: 'Unauthorized' };

  return { ok: true as const, via: 'admin' as const };
}

async function requireAdminOnly(_request: NextRequest, action?: string) {
  const ipGate = await assertAdminIp();
  if (!ipGate.ok) return { ok: false as const, status: ipGate.status, error: ipGate.error };
  const session = await getSession();
  if (!session) return { ok: false as const, status: 401, error: 'Unauthorized' };
  if (action) {
    const claims = await getSessionClaims();
    const role = (claims?.role || 'legacy') as import('@/lib/admin-users').AdminRole | 'legacy';
    if (!roleCan(role, action)) {
      return { ok: false as const, status: 403, error: 'Forbidden' };
    }
  }
  return { ok: true as const };
}

/** List backups or download one file. */
export async function GET(request: NextRequest) {
  const gate = await requireAdminOrCron(request);
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }

  const name = request.nextUrl.searchParams.get('file');
  if (name) {
    const raw = await readBackupFile(name);
    if (!raw) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return new NextResponse(raw, {
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Disposition': `attachment; filename="${name}"`,
        'Cache-Control': 'no-store',
      },
    });
  }

  const backups = await listSiteBackups();
  return NextResponse.json({ backups });
}

/**
 * Create snapshot (admin or cron), or restore:
 * body `{ "action": "restore", "file": "site-....json" }` — admin only.
 */
export async function POST(request: NextRequest) {
  let body: { action?: string; file?: string } = {};
  try {
    const ct = request.headers.get('content-type') || '';
    if (ct.includes('application/json')) {
      body = (await request.json()) as { action?: string; file?: string };
    }
  } catch {
    body = {};
  }

  if (body.action === 'restore') {
    const gate = await requireAdminOnly(request, 'restore_backup');
    if (!gate.ok) {
      return NextResponse.json({ error: gate.error }, { status: gate.status });
    }
    const name = body.file || '';
    const raw = await readBackupFile(name);
    if (!raw) return NextResponse.json({ error: 'Backup not found' }, { status: 404 });

    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(raw);
    } catch {
      return NextResponse.json({ error: 'Invalid backup JSON' }, { status: 400 });
    }
    const parsed = parseSiteData(parsedJson);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error }, { status: 400 });
    }

    // Snapshot current state before overwrite
    try {
      const current = await getSiteData();
      await createSiteBackupFromData(current, { label: 'pre-restore' });
    } catch {
      // continue restore even if pre-restore snapshot fails
    }

    await saveSiteData(parsed.data);
    return NextResponse.json({ ok: true, restored: name });
  }

  // Default: create backup
  const gate = await requireAdminOrCron(request);
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }

  try {
    const data = await getSiteData();
    const label = gate.via === 'cron' ? 'cron' : 'manual';
    const prev = process.env.AUTO_BACKUP;
    process.env.AUTO_BACKUP = 'false';
    try {
      const info = await createSiteBackupFromData(data, { label });
      return NextResponse.json({ ok: true, backup: info });
    } finally {
      if (prev === undefined) delete process.env.AUTO_BACKUP;
      else process.env.AUTO_BACKUP = prev;
    }
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: 'Backup failed' }, { status: 500 });
  }
}

/** Delete a backup file — admin only. ?file=name */
export async function DELETE(request: NextRequest) {
  const gate = await requireAdminOnly(request);
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }

  const name = request.nextUrl.searchParams.get('file') || '';
  const ok = await deleteBackupFile(name);
  if (!ok) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ ok: true });
}
