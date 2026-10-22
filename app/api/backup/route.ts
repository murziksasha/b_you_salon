import { NextRequest, NextResponse } from 'next/server';
import { verifySensitiveReauth } from '@/lib/admin/reauth';
import { apiError } from '@/lib/api/handler';
import { createSiteBackupFromData, deleteBackupFile, listSiteBackups, readBackupFile } from '@/lib/backup';
import { RestoreBackupSchema, reAuthPassword } from '@/lib/schemas/admin';
import { getSiteData, saveSiteData } from '@/lib/site-data';
import { parseSiteData } from '@/lib/validation';
import { requireAdminRole, type AdminAccess } from '@/lib/require-role';

export const dynamic = 'force-dynamic';

function cronAuthorized(request: NextRequest): boolean {
  const secret = process.env.BACKUP_CRON_SECRET;
  if (!secret) return false;
  const auth = request.headers.get('authorization') || '';
  const header = request.headers.get('x-backup-secret') || '';
  return auth === `Bearer ${secret}` || header === secret;
}

async function requireAdminOrCron(request: NextRequest, action: 'backup' | 'restore_backup') {
  if (cronAuthorized(request) && action === 'backup') return { ok: true as const, via: 'cron' as const };

  const g = await requireAdminRole(action);
  if (!g.ok) return { ok: false as const, response: g.response };
  const { ok: _ok, ...access } = g;
  return { ok: true as const, via: 'admin' as const, access: access as AdminAccess };
}

/** List backups or download one file. */
export async function GET(request: NextRequest) {
  const gate = await requireAdminOrCron(request, 'backup');
  if (!gate.ok) return gate.response;

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
    const parsed = RestoreBackupSchema.safeParse(body);
    if (!parsed.success) return apiError(400, 'validation', 'Bad request', parsed.error.issues);
    const gate = await requireAdminOrCron(request, 'restore_backup');
    if (!gate.ok) return gate.response;
    if (gate.via !== 'admin') return apiError(403, 'forbidden', 'Forbidden');
    const allowed = await verifySensitiveReauth(gate.access, {
      password: reAuthPassword(parsed.data),
      totp: parsed.data.totp,
    });
    if (!allowed) return apiError(403, 'reauth_failed', 'Невірний пароль або код 2FA');
    const name = parsed.data.file;
    const raw = await readBackupFile(name);
    if (!raw) return NextResponse.json({ error: 'Backup not found' }, { status: 404 });

    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(raw);
    } catch {
      return NextResponse.json({ error: 'Invalid backup JSON' }, { status: 400 });
    }
    const site = parseSiteData(parsedJson);
    if (!site.success) {
      return NextResponse.json({ error: site.error }, { status: 400 });
    }

    // Snapshot current state before overwrite
    try {
      const current = await getSiteData();
      await createSiteBackupFromData(current, { label: 'pre-restore' });
    } catch {
      // continue restore even if pre-restore snapshot fails
    }

    await saveSiteData(site.data);
    return NextResponse.json({ ok: true, restored: name });
  }

  // Default: create backup
  const gate = await requireAdminOrCron(request, 'backup');
  if (!gate.ok) return gate.response;

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
  const gate = await requireAdminOrCron(request, 'restore_backup');
  if (!gate.ok) return gate.response;

  const name = request.nextUrl.searchParams.get('file') || '';
  const ok = await deleteBackupFile(name);
  if (!ok) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ ok: true });
}
