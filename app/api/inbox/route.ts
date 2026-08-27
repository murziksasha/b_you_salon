import { NextRequest, NextResponse } from 'next/server';
import { listLeads, updateLead, deleteLead } from '@/lib/leads';
import { listOrders, updateOrder, deleteOrder } from '@/lib/orders';
import { historyByPhone, mergeInbox } from '@/lib/inbox';
import { isWorkflowStatus, validateClosePatch } from '@/lib/workflow';
import { appendActivity } from '@/lib/admin-activity';
import { requireAdminRole } from '@/lib/require-role';
import { toCsv } from '@/lib/csv';

export const dynamic = 'force-dynamic';

async function guard() {
  return requireAdminRole('inbox');
}

export async function GET(request: NextRequest) {
  const g = await guard();
  if (!g.ok) return g.response;

  const leads = await listLeads();
  const orders = await listOrders();
  const items = mergeInbox(leads, orders);
  const phone = request.nextUrl.searchParams.get('phone');
  if (phone) {
    return NextResponse.json({
      items: historyByPhone(items, phone),
      phone,
    });
  }

  const format = request.nextUrl.searchParams.get('format');
  if (format === 'csv') {
    const csv = toCsv(
      ['kind', 'id', 'createdAt', 'phone', 'status', 'note', 'product', 'pagePath', 'emailed'],
      items.map((i) => [
        i.kind,
        i.id,
        i.createdAt,
        i.phone,
        i.status,
        i.note || '',
        i.productTitle || '',
        i.pagePath || '',
        i.emailed,
      ]),
    );
    return new NextResponse(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': 'attachment; filename="inbox.csv"',
      },
    });
  }

  const open = items.filter((i) => i.open);
  return NextResponse.json({
    items,
    total: items.length,
    open: open.length,
    openLeads: open.filter((i) => i.kind === 'lead').length,
    openOrders: open.filter((i) => i.kind === 'order').length,
    stale: open.filter((i) => i.stale).length,
  });
}

export async function PATCH(request: NextRequest) {
  const g = await guard();
  if (!g.ok) return g.response;

  try {
    const body = (await request.json()) as {
      kind?: string;
      id?: string;
      status?: string;
      handled?: boolean;
      note?: string;
      callbackAt?: string;
      outcome?: string;
      assignee?: string;
    };
    if (!body.id || (body.kind !== 'lead' && body.kind !== 'order')) {
      return NextResponse.json({ error: 'Missing kind/id' }, { status: 400 });
    }
    if (body.status !== undefined && !isWorkflowStatus(body.status)) {
      return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
    }
    const status = body.status as undefined | import('@/lib/workflow').WorkflowStatus;
    const closeErr = validateClosePatch({
      status,
      outcome: body.outcome,
      note: body.note,
    });
    if (closeErr) {
      return NextResponse.json({ error: closeErr }, { status: 400 });
    }

    const patch = {
      status,
      handled: body.handled,
      note: body.note,
      callbackAt: body.callbackAt,
      outcome: body.outcome as undefined | import('@/lib/workflow').CloseOutcome,
      assignee: body.assignee,
    };

    if (body.kind === 'lead') {
      const updated = await updateLead(body.id, patch);
      if (!updated) return NextResponse.json({ error: 'Not found' }, { status: 404 });
      try {
        await appendActivity({
          kind: 'lead_status',
          message: `Заявка ${body.id.slice(0, 8)} → ${updated.status}`,
          actor: g.username,
        });
      } catch {
        /* ignore */
      }
      return NextResponse.json({ ok: true, item: updated, kind: 'lead' });
    }

    const updated = await updateOrder(body.id, patch);
    if (!updated) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    try {
      await appendActivity({
        kind: 'order_status',
        message: `Замовлення ${body.id.slice(0, 8)} → ${updated.status}`,
        actor: g.username,
      });
    } catch {
      /* ignore */
    }
    return NextResponse.json({ ok: true, item: updated, kind: 'order' });
  } catch {
    return NextResponse.json({ error: 'Bad request' }, { status: 400 });
  }
}

export async function DELETE(request: NextRequest) {
  const g = await guard();
  if (!g.ok) return g.response;

  try {
    const body = (await request.json()) as { kind?: string; id?: string };
    if (!body.id || (body.kind !== 'lead' && body.kind !== 'order')) {
      return NextResponse.json({ error: 'Missing kind/id' }, { status: 400 });
    }
    const ok =
      body.kind === 'lead' ? await deleteLead(body.id) : await deleteOrder(body.id);
    if (!ok) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: 'Bad request' }, { status: 400 });
  }
}
