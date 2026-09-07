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
  return [
    title,
    formatWhen(payload.createdAt),
    maskPhoneDisplay(payload.phone),
    ...statusLine(payload.status, payload.handled, payload.assignee),
    payload.serviceTitle ? `Послуга: ${payload.serviceTitle}` : '',
    payload.comment?.trim() || '',
    payload.viberHint ? `Viber: ${payload.viberHint}` : '',
  ]
    .filter(Boolean)
    .join('\n');
}

export function formatOrderPush(payload: {
  phone: string;
  productTitle: string;
  price?: number;
  fulfillment?: string;
  comment?: string;
  createdAt?: string;
  status?: WorkflowStatus | string;
  handled?: boolean;
  assignee?: string;
  viberHint?: string;
}): string {
  const fulfill =
    payload.fulfillment === 'delivery' ? 'Доставка' : payload.fulfillment === 'pickup' ? 'Самовивіз' : '';
  const price =
    typeof payload.price === 'number' ? `Сума: ${payload.price.toLocaleString('uk-UA')} ₴` : '';
  return [
    'Продаж',
    formatWhen(payload.createdAt),
    maskPhoneDisplay(payload.phone),
    ...statusLine(payload.status, payload.handled, payload.assignee),
    payload.productTitle ? `Товар: ${payload.productTitle}` : '',
    price,
    fulfill,
    payload.comment?.trim() || '',
    payload.viberHint ? `Viber: ${payload.viberHint}` : '',
  ]
    .filter(Boolean)
    .join('\n');
}

export function formatLeadListItem(lead: Lead, index: number): string {
  const kind = lead.source === 'booking' ? 'Запис' : 'Заявка';
  const extra = [lead.serviceTitle, lead.comment?.trim()].filter(Boolean).join(' · ');
  const st = normalizeStatus(lead.status, lead.handled);
  const who = lead.assignee ? ` · ${lead.assignee}` : '';
  return [
    `${index}. ${kind} · ${formatWhen(lead.createdAt)} · ${WORKFLOW_LABELS[st]}${who}`,
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
    `${index}. Продаж · ${formatWhen(order.createdAt)} · ${WORKFLOW_LABELS[st]}${who}`,
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
