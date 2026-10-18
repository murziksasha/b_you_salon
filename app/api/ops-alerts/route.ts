import { NextRequest, NextResponse } from 'next/server';
import { requireAdminRole } from '@/lib/require-role';
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
  if (cronAuthorized(request)) return { ok: true as const, via: 'cron' as const, response: null };
  const g = await requireAdminRole('ops');
  if (!g.ok) return { ok: false as const, via: 'admin' as const, response: g.response };
  return { ok: true as const, via: 'admin' as const, response: null };
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
