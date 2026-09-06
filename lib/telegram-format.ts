import type { Lead } from './leads';
import type { Order } from './orders';

export const TELEGRAM_TEXT_LIMIT = 4000;
export const TELEGRAM_LIST_MAX = 50;
export const TELEGRAM_LIST_DEFAULT = 10;

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

export function formatLeadPush(payload: {
  phone: string;
  source?: Lead['source'] | string;
  zone?: string;
  serviceTitle?: string;
  comment?: string;
  createdAt?: string;
}): string {
  const isBooking = payload.source === 'booking';
  const title = isBooking ? 'Запис' : 'Заявка';
  return [
    title,
    formatWhen(payload.createdAt),
    payload.phone,
    payload.serviceTitle ? `Послуга: ${payload.serviceTitle}` : '',
    payload.comment?.trim() || '',
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
}): string {
  const fulfill =
    payload.fulfillment === 'delivery' ? 'Доставка' : payload.fulfillment === 'pickup' ? 'Самовивіз' : '';
  const price =
    typeof payload.price === 'number' ? `Сума: ${payload.price.toLocaleString('uk-UA')} ₴` : '';
  return [
    'Продаж',
    formatWhen(payload.createdAt),
    payload.phone,
    payload.productTitle ? `Товар: ${payload.productTitle}` : '',
    price,
    fulfill,
    payload.comment?.trim() || '',
  ]
    .filter(Boolean)
    .join('\n');
}

export function formatLeadListItem(lead: Lead, index: number): string {
  const kind = lead.source === 'booking' ? 'Запис' : 'Заявка';
  const extra = [lead.serviceTitle, lead.comment?.trim()].filter(Boolean).join(' · ');
  return [
    `${index}. ${kind} · ${formatWhen(lead.createdAt)}`,
    lead.phone,
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
  return [
    `${index}. Продаж · ${formatWhen(order.createdAt)}`,
    order.phone,
    extra,
  ]
    .filter(Boolean)
    .join('\n');
}

export type PhoneMovement = {
  kind: 'booking' | 'callback' | 'order';
  at: string;
  detail?: string;
};

export function formatPhoneMovements(phone: string, items: PhoneMovement[]): string {
  if (!items.length) {
    return `Нічого не знайдено для ${phone}`;
  }
  const lines = items.map((item, i) => {
    const label = item.kind === 'order' ? 'Продаж' : item.kind === 'booking' ? 'Запис' : 'Заявка';
    const detail = (item.detail || '').trim();
    return [`${i + 1}. ${label}`, formatWhen(item.at), detail].filter(Boolean).join('\n');
  });
  return [`Усі рухи ${phone} (${items.length})`, ...lines].join('\n\n');
}
