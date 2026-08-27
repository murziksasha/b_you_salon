import type { Lead } from './leads';
import type { Order } from './orders';
import {
  isOpenStatus,
  isStaleOpen,
  isVeryStaleOpen,
  normalizeStatus,
  type WorkflowStatus,
} from './workflow';

export type InboxKind = 'lead' | 'order';

export type InboxItem = {
  kind: InboxKind;
  id: string;
  phone: string;
  createdAt: string;
  status: WorkflowStatus;
  handled: boolean;
  note?: string;
  emailed: boolean;
  handledAt?: string;
  callbackAt?: string;
  /** Lead-only */
  pagePath?: string;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  /** Order-only */
  productTitle?: string;
  productId?: string;
  productPrice?: number;
  productCode?: string;
  comment?: string;
  stale: boolean;
  veryStale: boolean;
  open: boolean;
  /** Same phone appears >1 time in full inbox */
  duplicatePhone?: boolean;
  outcome?: string;
  assignee?: string;
  claimedAt?: string;
};

export function leadToInbox(lead: Lead): InboxItem {
  const status = normalizeStatus(lead.status, lead.handled);
  return {
    kind: 'lead',
    id: lead.id,
    phone: lead.phone,
    createdAt: lead.createdAt,
    status,
    handled: lead.handled,
    note: lead.note,
    emailed: lead.emailed,
    handledAt: lead.handledAt,
    callbackAt: lead.callbackAt,
    pagePath: lead.pagePath,
    utmSource: lead.utmSource,
    utmMedium: lead.utmMedium,
    utmCampaign: lead.utmCampaign,
    outcome: lead.outcome,
    assignee: lead.assignee,
    claimedAt: lead.claimedAt,
    stale: isStaleOpen(lead.createdAt, status),
    veryStale: isVeryStaleOpen(lead.createdAt, status),
    open: isOpenStatus(status),
  };
}

export function orderToInbox(order: Order): InboxItem {
  const status = normalizeStatus(order.status, order.handled);
  return {
    kind: 'order',
    id: order.id,
    phone: order.phone,
    createdAt: order.createdAt,
    status,
    handled: order.handled,
    note: order.note,
    emailed: order.emailed,
    handledAt: order.handledAt,
    callbackAt: order.callbackAt,
    productTitle: order.items?.length
      ? order.items.map((i) => `${i.title} ×${i.qty}`).join(', ')
      : order.product.title,
    productId: order.product.id,
    productPrice: order.total ?? order.product.price,
    productCode: order.product.code,
    comment: [
      order.fulfillment === 'delivery' ? 'Доставка' : 'Самовивіз',
      order.address,
      order.comment,
    ]
      .filter(Boolean)
      .join(' · '),
    outcome: order.outcome,
    assignee: order.assignee,
    claimedAt: order.claimedAt,
    stale: isStaleOpen(order.createdAt, status),
    veryStale: isVeryStaleOpen(order.createdAt, status),
    open: isOpenStatus(status),
  };
}

export function mergeInbox(leads: Lead[], orders: Order[]): InboxItem[] {
  const items = [...leads.map(leadToInbox), ...orders.map(orderToInbox)];
  items.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));

  // Mark duplicate phones across full inbox
  const counts = new Map<string, number>();
  for (const i of items) {
    const d = i.phone.replace(/\D/g, '');
    if (d.length < 9) continue;
    counts.set(d, (counts.get(d) || 0) + 1);
  }
  for (const i of items) {
    const d = i.phone.replace(/\D/g, '');
    if ((counts.get(d) || 0) > 1) i.duplicatePhone = true;
  }

  return items;
}

/** Upcoming scheduled callbacks (callbackAt in the future or last 2h overdue). */
export function upcomingCallbacks(items: InboxItem[], limit = 20): InboxItem[] {
  const now = Date.now();
  const windowStart = now - 2 * 60 * 60 * 1000;
  return items
    .filter((i) => {
      if (!i.callbackAt || !i.open) return false;
      const t = Date.parse(i.callbackAt);
      return Number.isFinite(t) && t >= windowStart;
    })
    .sort((a, b) => Date.parse(a.callbackAt!) - Date.parse(b.callbackAt!))
    .slice(0, limit);
}

export function historyByPhone(items: InboxItem[], phone: string): InboxItem[] {
  const digits = phone.replace(/\D/g, '');
  if (!digits) return [];
  return items.filter((i) => i.phone.replace(/\D/g, '') === digits);
}

export type DayBucket = { date: string; leads: number; orders: number };

/** Last N calendar days buckets (uk local date keys YYYY-MM-DD). */
export function countByDay(leads: Lead[], orders: Order[], days = 30): DayBucket[] {
  const map = new Map<string, DayBucket>();
  const today = new Date();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    map.set(key, { date: key, leads: 0, orders: 0 });
  }
  for (const l of leads) {
    const key = l.createdAt.slice(0, 10);
    const b = map.get(key);
    if (b) b.leads += 1;
  }
  for (const o of orders) {
    const key = o.createdAt.slice(0, 10);
    const b = map.get(key);
    if (b) b.orders += 1;
  }
  return Array.from(map.values());
}

export function topPagePaths(leads: Lead[], limit = 8): Array<{ path: string; count: number }> {
  const map = new Map<string, number>();
  for (const l of leads) {
    const p = (l.pagePath || '/').trim() || '/';
    map.set(p, (map.get(p) || 0) + 1);
  }
  return Array.from(map.entries())
    .map(([path, count]) => ({ path, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}

export function topUtmSources(leads: Lead[], limit = 8): Array<{ source: string; count: number }> {
  const map = new Map<string, number>();
  for (const l of leads) {
    const s = (l.utmSource || '(direct)').trim() || '(direct)';
    map.set(s, (map.get(s) || 0) + 1);
  }
  return Array.from(map.entries())
    .map(([source, count]) => ({ source, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}

export function topOrderedProducts(
  orders: Order[],
  limit = 8,
): Array<{ productId: string; title: string; count: number }> {
  const map = new Map<string, { productId: string; title: string; count: number }>();
  for (const o of orders) {
    const id = o.product.id;
    const cur = map.get(id);
    if (cur) cur.count += 1;
    else map.set(id, { productId: id, title: o.product.title, count: 1 });
  }
  return Array.from(map.values())
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}
