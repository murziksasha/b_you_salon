import type { Lead } from './leads';
import type { Order } from './orders';
import { maskPhoneDisplay, normalizePhoneCanonical } from './phone';
import { viberChatLink } from './reply-templates';
import { normalizeStatus, WORKFLOW_LABELS, type WorkflowStatus } from './workflow';

export const TELEGRAM_TEXT_LIMIT = 4000;
export const TELEGRAM_LIST_MAX = 50;
export const TELEGRAM_LIST_DEFAULT = 10;

export type TelegramInlineButton = {
  text: string;
  callback_data?: string;
  url?: string;
  copy_text?: { text: string };
};

export type TelegramReplyMarkup = {
  keyboard?: Array<Array<{ text: string }>>;
  inline_keyboard?: Array<Array<TelegramInlineButton>>;
  resize_keyboard?: boolean;
  one_time_keyboard?: boolean;
};

export function formatWhen(iso?: string, now = new Date()): string {
  const d = iso ? new Date(iso) : now;
  if (!Number.isFinite(d.getTime())) return iso || '';
  return d.toLocaleString('uk-UA', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function clampListCount(raw: unknown, fallback = TELEGRAM_LIST_DEFAULT): number {
  const n = typeof raw === 'number' ? raw : Number.parseInt(String(raw ?? ''), 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(TELEGRAM_LIST_MAX, Math.max(1, Math.floor(n)));
}

export function chunkTelegramText(text: string, max = TELEGRAM_TEXT_LIMIT): string[] {
  const src = text.trim();
  if (!src) return [];
  if (src.length <= max) return [src];
  const chunks: string[] = [];
  let rest = src;
  while (rest.length > max) {
    let cut = rest.lastIndexOf('\n', max);
    if (cut < max * 0.5) cut = max;
    chunks.push(rest.slice(0, cut).trimEnd());
    rest = rest.slice(cut).trimStart();
  }
  if (rest) chunks.push(rest);
  return chunks;
}

function statusLine(status?: WorkflowStatus | string, handled?: boolean, assignee?: string): string[] {
  const st = normalizeStatus(status, handled);
  const label = WORKFLOW_LABELS[st] || st;
  const lines = [`Статус: ${label}`];
  if (assignee?.trim()) lines.push(`Відповідальний: ${assignee.trim()}`);
  return lines;
}

function zoneLabel(zone?: string): string {
  if (zone === 'salon') return 'салон';
  if (zone === 'shop') return 'магазин';
  if (zone === 'home') return 'головна';
  return (zone || '').trim();
}

function money(n: number): string {
  return `${n.toLocaleString('uk-UA')} ₴`;
}

export type OrderPushItem = { title: string; qty: number; price?: number };

export function formatLeadPush(payload: {
  phone: string;
  source?: Lead['source'] | string;
  zone?: string;
  serviceTitle?: string;
  comment?: string;
  createdAt?: string;
  status?: WorkflowStatus | string;
  handled?: boolean;
  assignee?: string;
  /** When Viber URL button is unavailable, include the deep link in the body. */
  viberHint?: string;
}): string {
  const isBooking = payload.source === 'booking';
  const title = isBooking ? 'Запис' : 'Заявка';
  const zone = zoneLabel(payload.zone);
  return [
    title,
    `Надіслано: ${formatWhen(payload.createdAt)}`,
    maskPhoneDisplay(payload.phone),
    ...statusLine(payload.status, payload.handled, payload.assignee),
    payload.serviceTitle?.trim() ? `Потрібно: ${payload.serviceTitle.trim()}` : '',
    zone ? `Зона: ${zone}` : '',
    payload.comment?.trim() || '',
    payload.viberHint ? `Viber: ${payload.viberHint}` : '',
  ]
    .filter(Boolean)
    .join('\n');
}

export function formatOrderPush(payload: {
  phone: string;
  productTitle?: string;
  items?: OrderPushItem[];
  consult?: boolean;
  name?: string;
  address?: string;
  price?: number;
  fulfillment?: string;
  comment?: string;
  createdAt?: string;
  status?: WorkflowStatus | string;
  handled?: boolean;
  assignee?: string;
  viberHint?: string;
}): string {
  const consult = Boolean(payload.consult);
  const fulfill = consult
    ? ''
    : payload.fulfillment === 'delivery'
      ? 'Отримання: Доставка'
      : payload.fulfillment === 'pickup'
        ? 'Отримання: Самовивіз'
        : '';
  const price =
    !consult && typeof payload.price === 'number' ? `Сума: ${money(payload.price)}` : '';
  const itemLines = consult
    ? [`Товар: ${payload.productTitle || 'Консультація по товарах'}`]
    : payload.items?.length
      ? [
          'Товари:',
          ...payload.items.map((i) => {
            const qty = Number.isFinite(i.qty) && i.qty > 0 ? i.qty : 1;
            const line = typeof i.price === 'number' ? ` — ${money(i.price * qty)}` : '';
            return `• ${i.title} ×${qty}${line}`;
          }),
        ]
      : payload.productTitle
        ? [`Товар: ${payload.productTitle}`]
        : [];
  return [
    'Продаж',
    `Надіслано: ${formatWhen(payload.createdAt)}`,
    maskPhoneDisplay(payload.phone),
    payload.name?.trim() ? `Імʼя: ${payload.name.trim()}` : '',
    ...statusLine(payload.status, payload.handled, payload.assignee),
    ...itemLines,
    price,
    fulfill,
    !consult && payload.address?.trim() ? `Адреса: ${payload.address.trim()}` : '',
    payload.comment?.trim() || '',
    payload.viberHint ? `Viber: ${payload.viberHint}` : '',
  ]
    .filter(Boolean)
    .join('\n');
}

export function leadPushFromLead(lead: Lead, extra?: { viberHint?: string }): Parameters<typeof formatLeadPush>[0] {
  return {
    phone: lead.phone,
    source: lead.source,
    zone: lead.zone,
    serviceTitle: lead.serviceTitle,
    comment: lead.comment,
    createdAt: lead.createdAt,
    status: lead.status,
    handled: lead.handled,
    assignee: lead.assignee,
    viberHint: extra?.viberHint,
  };
}

export function orderPushFromOrder(
  order: Order,
  extra?: { viberHint?: string },
): Parameters<typeof formatOrderPush>[0] {
  const consult = order.source === 'consult' || order.product?.id === 'consult';
  const items: OrderPushItem[] | undefined = consult
    ? undefined
    : order.items?.length
      ? order.items.map((i) => ({ title: i.title, qty: i.qty, price: i.price }))
      : [{ title: order.product.title, qty: order.quantity || 1, price: order.product.price }];
  return {
    phone: order.phone,
    productTitle: order.product.title,
    items,
    consult,
    name: order.name,
    address: order.address,
    price: consult ? undefined : order.total ?? order.product.price,
    fulfillment: consult ? undefined : order.fulfillment,
    comment: order.comment,
    createdAt: order.createdAt,
    status: order.status,
    handled: order.handled,
    assignee: order.assignee,
    viberHint: extra?.viberHint,
  };
}

export function formatLeadListItem(lead: Lead, index: number): string {
  const kind = lead.source === 'booking' ? 'Запис' : 'Заявка';
  const extra = [lead.serviceTitle, lead.comment?.trim()].filter(Boolean).join(' · ');
  const st = normalizeStatus(lead.status, lead.handled);
  const who = lead.assignee ? ` · ${lead.assignee}` : '';
  return [
    `${index}. ${kind} · Надіслано ${formatWhen(lead.createdAt)} · ${WORKFLOW_LABELS[st]}${who}`,
    maskPhoneDisplay(lead.phone),
    extra ? extra : '',
  ]
    .filter(Boolean)
    .join('\n');
}

export function formatOrderListItem(order: Order, index: number): string {
  const title = order.items?.length
    ? order.items.map((i) => `${i.title} ×${i.qty}`).join(', ')
    : order.product.title;
  const extra = [title, order.comment?.trim()].filter(Boolean).join(' · ');
  const st = normalizeStatus(order.status, order.handled);
  const who = order.assignee ? ` · ${order.assignee}` : '';
  return [
    `${index}. Продаж · Надіслано ${formatWhen(order.createdAt)} · ${WORKFLOW_LABELS[st]}${who}`,
    maskPhoneDisplay(order.phone),
    extra,
  ]
    .filter(Boolean)
    .join('\n');
}

export type PhoneMovement = {
  kind: 'booking' | 'callback' | 'order';
  at: string;
  detail?: string;
  status?: WorkflowStatus | string;
  handled?: boolean;
  assignee?: string;
  id?: string;
  inboxKind?: 'lead' | 'order';
  open?: boolean;
};

export function formatPhoneMovements(phone: string, items: PhoneMovement[]): string {
  const full = normalizePhoneCanonical(phone) || phone;
  if (!items.length) {
    return `Нічого не знайдено для ${full}`;
  }
  const lines = items.map((item, i) => {
    const label = item.kind === 'order' ? 'Продаж' : item.kind === 'booking' ? 'Запис' : 'Заявка';
    const detail = (item.detail || '').trim();
    const st = item.status != null || item.handled != null ? normalizeStatus(item.status, item.handled) : null;
    const status = st ? `Статус: ${WORKFLOW_LABELS[st]}${item.assignee ? ` · ${item.assignee}` : ''}` : '';
    return [`${i + 1}. ${label}`, formatWhen(item.at), status, detail].filter(Boolean).join('\n');
  });
  return [`Усі рухи ${full} (${items.length})`, ...lines].join('\n\n');
}

export type PushClaimRef = { kind: 'lead' | 'order'; id: string };

export function pushActionKeyboard(opts: {
  phone: string;
  siteUrl?: string;
  viberUrl?: string;
  claim?: PushClaimRef | null;
}): TelegramReplyMarkup {
  const full = normalizePhoneCanonical(opts.phone);
  const rows: TelegramInlineButton[][] = [];
  const copyRow: TelegramInlineButton[] = [];
  if (full) copyRow.push({ text: 'Копіювати номер', copy_text: { text: full } });
  if (opts.viberUrl) copyRow.push({ text: 'Viber', url: opts.viberUrl });
  if (copyRow.length) rows.push(copyRow);

  const second: TelegramInlineButton[] = [];
  if (opts.siteUrl) {
    const q = encodeURIComponent(full);
    second.push({ text: 'Відкрити в адмінці', url: `${opts.siteUrl}/admin/clients?phone=${q}` });
  }
  if (opts.claim?.id) {
    const k = opts.claim.kind === 'order' ? 'o' : 'l';
    second.push({ text: 'Взяти в роботу', callback_data: `claim:ask:${k}:${opts.claim.id}` });
  }
  if (second.length) rows.push(second);

  return { inline_keyboard: rows };
}

export function viberHintIfNeeded(phone: string, viberUrl?: string): string | undefined {
  if (viberUrl) return undefined;
  const link = viberChatLink(phone);
  return link && link !== 'viber://' ? link : undefined;
}

export function stripCopyTextButtons(markup?: TelegramReplyMarkup): TelegramReplyMarkup | undefined {
  if (!markup?.inline_keyboard) return markup;
  const inline_keyboard = markup.inline_keyboard
    .map((row) => row.filter((b) => !b.copy_text))
    .filter((row) => row.length > 0);
  if (!inline_keyboard.length && !markup.keyboard) return undefined;
  return { ...markup, inline_keyboard };
}
