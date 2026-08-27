import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { assertAdminIp } from '@/lib/require-admin-ip';
import { roleCan } from '@/lib/admin-users';
import { getSessionClaims } from '@/lib/auth';
import { runOpsAlerts } from '@/lib/ops-alerts';

export const dynamic = 'force-dynamic';

function cronAuthorized(request: NextRequest): boolean {
  const secret = process.env.BACKUP_CRON_SECRET || process.env.OPS_ALERTS_SECRET;
  if (!secret) return false;
  const auth = request.headers.get('authorization') || '';
  const header = request.headers.get('x-ops-secret') || request.headers.get('x-backup-secret') || '';
  return auth === `Bearer ${secret}` || header === secret;
}

async function gate(request: NextRequest) {
  if (cronAuthorized(request)) return { ok: true as const, via: 'cron' as const };

  const ipGate = await assertAdminIp();
  if (!ipGate.ok) {
    return { ok: false as const, response: NextResponse.json({ error: ipGate.error }, { status: ipGate.status }) };
  }
  if (!(await getSession())) {
    return { ok: false as const, response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }
  const claims = await getSessionClaims();
  const role = (claims?.role || 'legacy') as import('@/lib/admin-users').AdminRole | 'legacy';
  if (!roleCan(role, 'content')) {
    return { ok: false as const, response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  }
  return { ok: true as const, via: 'admin' as const };
}

/** Trigger ops health checks → Telegram (throttled 12h per type). Cron: Bearer BACKUP_CRON_SECRET. */
export async function POST(request: NextRequest) {
  const g = await gate(request);
  if (!g.ok) return g.response;
  const result = await runOpsAlerts();
  return NextResponse.json({ ok: true, via: g.via, ...result });
}

export async function GET(request: NextRequest) {
  const g = await gate(request);
  if (!g.ok) return g.response;
  const result = await runOpsAlerts();
  return NextResponse.json({ ok: true, via: g.via, ...result });
}
