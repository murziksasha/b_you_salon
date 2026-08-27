import { NextRequest, NextResponse } from 'next/server';
import { requireAdminRole } from '@/lib/require-role';
import { listLeads } from '@/lib/leads';
import { listOrders } from '@/lib/orders';
import { buildEveningDigest, buildMorningDigest, buildSlaReminder } from '@/lib/process-digest';
import { sendTelegramMessage, telegramConfigured } from '@/lib/notify';
import { appendActivity } from '@/lib/admin-activity';

export const dynamic = 'force-dynamic';

/**
 * Process digests.
 * GET ?kind=morning|evening|sla — preview text
 * POST { kind, send?: boolean } — optionally Telegram
 */
export async function GET(request: NextRequest) {
  const g = await requireAdminRole('inbox');
  if (!g.ok) return g.response;
  const kind = request.nextUrl.searchParams.get('kind') || 'morning';
  const [leads, orders] = await Promise.all([listLeads(), listOrders()]);
  let text = '';
  if (kind === 'evening') text = buildEveningDigest(leads, orders);
  else if (kind === 'sla') text = buildSlaReminder(leads, orders) || 'SLA: все в нормі';
  else text = buildMorningDigest(leads, orders);
  return NextResponse.json({ kind, text, telegram: telegramConfigured() });
}

export async function POST(request: NextRequest) {
  const g = await requireAdminRole('inbox');
  if (!g.ok) return g.response;
  try {
    const body = (await request.json()) as { kind?: string; send?: boolean };
    const kind = body.kind || 'morning';
    const [leads, orders] = await Promise.all([listLeads(), listOrders()]);
    let text = '';
    if (kind === 'evening') text = buildEveningDigest(leads, orders);
    else if (kind === 'sla') text = buildSlaReminder(leads, orders) || 'SLA: все в нормі';
    else text = buildMorningDigest(leads, orders);

    let sent = false;
    if (body.send) {
      if (!telegramConfigured()) {
        return NextResponse.json({ error: 'Telegram не налаштовано', text }, { status: 503 });
      }
      sent = await sendTelegramMessage(text);
      if (!sent) return NextResponse.json({ error: 'Send failed', text }, { status: 502 });
      try {
        await appendActivity({
          kind: 'other',
          message: `Digest ${kind} → Telegram`,
          actor: g.username,
        });
      } catch {
        /* ignore */
      }
    }
    return NextResponse.json({ ok: true, kind, text, sent });
  } catch {
    return NextResponse.json({ error: 'Bad request' }, { status: 400 });
  }
}
