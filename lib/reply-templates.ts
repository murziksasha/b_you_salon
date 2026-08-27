import type { WorkflowStatus } from './workflow';

export type ReplyTemplate = {
  id: string;
  label: string;
  /** Statuses this template is most useful for */
  statuses?: WorkflowStatus[];
  body: string;
};

/** Ready-to-copy SMS / messenger texts. Placeholders: {phone} {product} {name} */
export const REPLY_TEMPLATES: ReplyTemplate[] = [
  {
    id: 'greet',
    label: 'Привітання',
    statuses: ['new', 'called'],
    body: 'Доброго дня{name}! Це студія B_You. Отримали вашу заявку{product} — передзвонимо найближчим часом. Якщо терміново — напишіть, будь ласка.',
  },
  {
    id: 'callback_later',
    label: 'Передзвонимо пізніше',
    statuses: ['waiting', 'no_answer'],
    body: 'Доброго дня{name}! Не змогли додзвонитися на {phone}. Напишіть зручний час — передзвонимо.',
  },
  {
    id: 'no_answer',
    label: 'Не відповіли',
    statuses: ['no_answer'],
    body: 'Доброго дня{name}! Це студія B_You. Дзвонили щодо вашої заявки{product}. Напишіть, коли зручно передзвонити.',
  },
  {
    id: 'quote_ok',
    label: 'Прийняли в роботу',
    statuses: ['called', 'waiting', 'done'],
    body: 'Дякуємо{name}! Прийняли вашу заявку{product} в роботу. За потреби уточнимо деталі по телефону.',
  },
  {
    id: 'order_confirm',
    label: 'Замовлення підтверджено',
    statuses: ['called', 'done'],
    body: 'Доброго дня{name}! Ваше замовлення{product} з магазину B_You прийнято. Звʼяжемося для узгодження деталей. Тел. для звʼязку: {phone}.',
  },
  {
    id: 'done_thanks',
    label: 'Дякуємо / закрито',
    statuses: ['done'],
    body: 'Дякуємо{name}, що звернулися до B_You! Якщо знадобиться допомога — завжди на звʼязку.',
  },
];

export function templatesForStatus(status?: WorkflowStatus): ReplyTemplate[] {
  if (!status) return REPLY_TEMPLATES;
  const matched = REPLY_TEMPLATES.filter((t) => !t.statuses || t.statuses.includes(status));
  return matched.length ? matched : REPLY_TEMPLATES;
}

export type TemplateVars = {
  phone?: string;
  product?: string;
  name?: string;
};

/** Fill {phone} {product} {name}. Empty name/product omit awkward spaces. */
export function fillTemplate(body: string, vars: TemplateVars): string {
  const phone = (vars.phone || '').trim();
  const product = (vars.product || '').trim();
  const name = (vars.name || '').trim();
  return body
    .replace(/\{phone\}/g, phone || '—')
    .replace(/\{product\}/g, product ? ` (${product})` : '')
    .replace(/\{name\}/g, name ? `, ${name}` : '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/** Digits only for deep links. */
export function phoneToDigits(phone: string): string {
  let d = phone.replace(/\D/g, '');
  if (d.startsWith('0') && d.length === 10) d = `38${d}`;
  if (d.length === 9) d = `380${d}`;
  return d;
}

export function viberChatLink(phone: string): string {
  const d = phoneToDigits(phone);
  return d ? `viber://chat?number=%2B${d}` : 'viber://';
}

export function telegramShareLink(text: string): string {
  return `https://t.me/share/url?url=${encodeURIComponent('')}&text=${encodeURIComponent(text)}`;
}

export function smsLink(phone: string, body: string): string {
  const d = phoneToDigits(phone);
  return `sms:${d ? `+${d}` : ''}?body=${encodeURIComponent(body)}`;
}
