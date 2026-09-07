import { appendActivity } from './admin-activity';
import { mergeInbox } from './inbox';
import { listLeads, type Lead } from './leads';
import { notifyLead, notifyOrder } from './notify';
import { listOrders, type Order } from './orders';
import { isQuietHours } from './quiet-hours';
import { CONSULT_PRODUCT_TITLE, isConsultOrder } from './shop-consult';
import { shouldSendTelegramPush } from './telegram-notify-policy';
import { getTelegramBotSettings } from './telegram-store';

async function skipActivity(reason: string, detail?: string): Promise<void> {
  try {
    await appendActivity({
      kind: 'other',
      message: `Telegram skip: ${reason}`,
      detail,
    });
  } catch {
    /* ignore */
  }
}

async function policyContext(phone: string, newId: string | undefined, kind: 'lead' | 'order', deduped?: boolean) {
  const [leads, orders, settings] = await Promise.all([listLeads(), listOrders(), getTelegramBotSettings()]);
  const inbox = mergeInbox(leads, orders);
  const quiet = isQuietHours({
    start: settings.quietStart,
    end: settings.quietEnd,
    timeZone: settings.timezone,
  });
  return shouldSendTelegramPush({ kind, phone, newId, inbox, quiet, deduped });
}

export async function autoNotifyNewLead(lead: Lead | null, opts?: { deduped?: boolean }): Promise<boolean> {
  if (!lead) return false;
  const decision = await policyContext(lead.phone, lead.id, 'lead', opts?.deduped);
  if (!decision.send) {
    await skipActivity(decision.reason || 'skip', lead.phone);
    return false;
  }
  return notifyLead({
    phone: lead.phone,
    leadId: lead.id,
    pagePath: lead.pagePath,
    zone: lead.zone,
    serviceTitle: lead.serviceTitle,
    comment: lead.comment,
    source: lead.source,
    createdAt: lead.createdAt,
    status: lead.status,
    handled: lead.handled,
    assignee: lead.assignee,
  });
}

export async function autoNotifyNewOrder(order: Order | null): Promise<boolean> {
  if (!order) return false;
  const decision = await policyContext(order.phone, order.id, 'order');
  if (!decision.send) {
    await skipActivity(decision.reason || 'skip', order.phone);
    return false;
  }
  const consult = isConsultOrder(order);
  return notifyOrder({
    phone: order.phone,
    productTitle: consult
      ? CONSULT_PRODUCT_TITLE
      : order.items?.length
        ? order.items.map((i) => `${i.title} ×${i.qty}`).join(', ')
        : order.product.title,
    price: consult ? undefined : order.total ?? order.product.price,
    orderId: order.id,
    fulfillment: consult ? undefined : order.fulfillment,
    comment: order.comment,
    createdAt: order.createdAt,
    status: order.status,
    handled: order.handled,
    assignee: order.assignee,
  });
}
