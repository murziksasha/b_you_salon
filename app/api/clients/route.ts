import { NextRequest, NextResponse } from 'next/server';
import { requireAdminRole } from '@/lib/require-role';
import { listLeads } from '@/lib/leads';
import { listOrders } from '@/lib/orders';
import { historyByPhone, mergeInbox } from '@/lib/inbox';

export const dynamic = 'force-dynamic';

/** Client profile by phone: all leads/orders + aggregates. */
export async function GET(request: NextRequest) {
  const g = await requireAdminRole('inbox');
  if (!g.ok) return g.response;

  const phone = (request.nextUrl.searchParams.get('phone') || '').trim();
  if (!phone || phone.replace(/\D/g, '').length < 6) {
    return NextResponse.json({ error: 'phone required' }, { status: 400 });
  }

  const [leads, orders] = await Promise.all([listLeads(), listOrders()]);
  const all = mergeInbox(leads, orders);
  const items = historyByPhone(all, phone);
  const open = items.filter((i) => i.open).length;
  const ordersN = items.filter((i) => i.kind === 'order').length;
  const leadsN = items.filter((i) => i.kind === 'lead').length;

  return NextResponse.json({
    phone,
    items,
    stats: {
      total: items.length,
      open,
      leads: leadsN,
      orders: ordersN,
      firstAt: items.length ? items[items.length - 1].createdAt : null,
      lastAt: items.length ? items[0].createdAt : null,
    },
  });
}
