import { NextRequest, NextResponse } from 'next/server';
import { requireAdminRole } from '@/lib/require-role';
import { listLeads } from '@/lib/leads';
import { listOrders } from '@/lib/orders';
import { sendTelegramMessage, telegramConfigured } from '@/lib/notify';
import {
  formatBulkSummaryLine,
  notifyOneLead,
  notifyOneOrder,
  type NotifyTarget,
} from '@/lib/notify-admin';
import { appendActivity } from '@/lib/admin-activity';

export const dynamic = 'force-dynamic';

const MAX_BULK = 25;

/**
 * Admin-triggered re-notify (Telegram).
 * - { text }
 * - { kind, id, note? }
 * - { items: [{kind,id}], note? }
 */
export async function POST(request: NextRequest) {
  const g = await requireAdminRole('inbox');
  if (!g.ok) return g.response;

  if (!telegramConfigured()) {
    return NextResponse.json(
      { error: 'Telegram не налаштовано (TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID)' },
      { status: 503 },
    );
  }

  try {
    const body = (await request.json()) as {
      kind?: string;
      id?: string;
      text?: string;
      note?: string;
      items?: Array<{ kind?: string; id?: string }>;
    };

    const note = typeof body.note === 'string' ? body.note.trim() : '';

    if (typeof body.text === 'string' && body.text.trim()) {
      const ok = await sendTelegramMessage(`[Admin] ${body.text.trim()}`);
      if (!ok) return NextResponse.json({ error: 'Не вдалося надіслати' }, { status: 502 });
      try {
        await appendActivity({
          kind: 'other',
          message: 'Telegram: ручне повідомлення',
          actor: g.username,
        });
      } catch {
        /* ignore */
      }
      return NextResponse.json({ ok: true });
    }

    // Bulk
    if (Array.isArray(body.items) && body.items.length > 0) {
      const targets: NotifyTarget[] = body.items
        .filter(
          (i): i is { kind: 'lead' | 'order'; id: string } =>
            (i.kind === 'lead' || i.kind === 'order') && typeof i.id === 'string' && Boolean(i.id),
        )
        .slice(0, MAX_BULK);

      if (!targets.length) {
        return NextResponse.json({ error: 'Empty items' }, { status: 400 });
      }

      if (note) {
        await sendTelegramMessage(`[Admin bulk] ${note.slice(0, 400)}`);
      }

      const [leads, orders] = await Promise.all([listLeads(), listOrders()]);
      let sent = 0;
      let failed = 0;
      for (const t of targets) {
        if (t.kind === 'lead') {
          const lead = leads.find((l) => l.id === t.id);
          if (!lead) {
            failed++;
            continue;
          }
          const ok = await notifyOneLead(lead);
          if (ok) sent++;
          else failed++;
        } else {
          const order = orders.find((o) => o.id === t.id);
          if (!order) {
            failed++;
            continue;
          }
          const ok = await notifyOneOrder(order);
          if (ok) sent++;
          else failed++;
        }
      }

      try {
        await appendActivity({
          kind: 'other',
          message: `${formatBulkSummaryLine(targets)} · ok ${sent} fail ${failed}`,
          actor: g.username,
        });
      } catch {
        /* ignore */
      }

      return NextResponse.json({ ok: true, sent, failed, total: targets.length });
    }

    if (!body.id || (body.kind !== 'lead' && body.kind !== 'order')) {
      return NextResponse.json({ error: 'Missing kind/id or items' }, { status: 400 });
    }

    if (body.kind === 'lead') {
      const leads = await listLeads();
      const lead = leads.find((l) => l.id === body.id);
      if (!lead) return NextResponse.json({ error: 'Not found' }, { status: 404 });
      const ok = await notifyOneLead(lead, note || undefined);
      if (!ok) return NextResponse.json({ error: 'Не вдалося надіслати' }, { status: 502 });
      try {
        await appendActivity({
          kind: 'lead_status',
          message: `Telegram re-notify заявка ${lead.id.slice(0, 8)}`,
          actor: g.username,
        });
      } catch {
        /* ignore */
      }
      return NextResponse.json({ ok: true });
    }

    const orders = await listOrders();
    const order = orders.find((o) => o.id === body.id);
    if (!order) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    const ok = await notifyOneOrder(order, note || undefined);
    if (!ok) return NextResponse.json({ error: 'Не вдалося надіслати' }, { status: 502 });
    try {
      await appendActivity({
        kind: 'order_status',
        message: `Telegram re-notify замовлення ${order.id.slice(0, 8)}`,
        actor: g.username,
      });
    } catch {
      /* ignore */
    }
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: 'Bad request' }, { status: 400 });
  }
}

export async function GET() {
  const g = await requireAdminRole('inbox');
  if (!g.ok) return g.response;
  return NextResponse.json({ configured: telegramConfigured() });
}
