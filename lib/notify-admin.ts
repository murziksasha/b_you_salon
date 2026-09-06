import type { Lead } from './leads';
import type { Order } from './orders';
import { broadcastTelegram, notifyLead, notifyOrder } from './notify';

export type NotifyTarget = { kind: 'lead' | 'order'; id: string };

export async function notifyOneLead(lead: Lead, note?: string): Promise<boolean> {
  const utm = [lead.utmSource, lead.utmMedium, lead.utmCampaign].filter(Boolean).join(' / ');
  const ok = await notifyLead({
    phone: lead.phone,
    leadId: lead.id,
    pagePath: lead.pagePath,
    utmLine: utm || undefined,
    zone: lead.zone,
    serviceTitle: lead.serviceTitle,
    comment: lead.comment,
    source: lead.source,
    createdAt: lead.createdAt,
    status: lead.status,
    handled: lead.handled,
    assignee: lead.assignee,
  });
  if (ok && note?.trim()) {
    await broadcastTelegram(`📝 Нотатка: ${note.trim().slice(0, 500)}`, 'lead');
  }
  return ok;
}

export async function notifyOneOrder(order: Order, note?: string): Promise<boolean> {
  const ok = await notifyOrder({
    phone: order.phone,
    productTitle: order.items?.length
      ? order.items.map((i) => `${i.title} ×${i.qty}`).join(', ')
      : order.product.title,
    price: order.total ?? order.product.price,
    orderId: order.id,
    fulfillment: order.fulfillment,
    comment: order.comment,
    createdAt: order.createdAt,
    status: order.status,
    handled: order.handled,
    assignee: order.assignee,
  });
  if (ok && note?.trim()) {
    await broadcastTelegram(`📝 Нотатка: ${note.trim().slice(0, 500)}`, 'order');
  }
  return ok;
}

export function formatBulkSummaryLine(targets: NotifyTarget[]): string {
  const leads = targets.filter((t) => t.kind === 'lead').length;
  const orders = targets.filter((t) => t.kind === 'order').length;
  return `Telegram bulk: ${targets.length} (заявки ${leads}, замовлення ${orders})`;
}
