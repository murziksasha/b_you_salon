import type { Lead } from './leads';
import type { Order } from './orders';
import { notifyLead, notifyOrder, sendTelegramMessage } from './notify';

export type NotifyTarget = { kind: 'lead' | 'order'; id: string };

export async function notifyOneLead(lead: Lead, note?: string): Promise<boolean> {
  const utm = [lead.utmSource, lead.utmMedium, lead.utmCampaign].filter(Boolean).join(' / ');
  const ok = await notifyLead({
    phone: lead.phone,
    leadId: lead.id,
    pagePath: lead.pagePath,
    utmLine: utm || undefined,
  });
  if (ok && note?.trim()) {
    await sendTelegramMessage(`📝 Нотатка: ${note.trim().slice(0, 500)}`);
  }
  return ok;
}

export async function notifyOneOrder(order: Order, note?: string): Promise<boolean> {
  const ok = await notifyOrder({
    phone: order.phone,
    productTitle: order.product.title,
    price: order.product.price,
    orderId: order.id,
  });
  if (ok && note?.trim()) {
    await sendTelegramMessage(`📝 Нотатка: ${note.trim().slice(0, 500)}`);
  }
  return ok;
}

export function formatBulkSummaryLine(targets: NotifyTarget[]): string {
  const leads = targets.filter((t) => t.kind === 'lead').length;
  const orders = targets.filter((t) => t.kind === 'order').length;
  return `Telegram bulk: ${targets.length} (заявки ${leads}, замовлення ${orders})`;
}
