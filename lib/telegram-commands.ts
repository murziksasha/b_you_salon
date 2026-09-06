import type { Lead } from './leads';
import type { Order } from './orders';
import { listLeads } from './leads';
import { listOrders } from './orders';
import { phoneDigits, phonesMatch } from './phone';
import { rateLimit } from './rate-limit';
import {
  consumeTelegramPairing,
  getTelegramSubscriber,
  patchTelegramSubscriber,
  type ConsumePairingResult,
  type TelegramSubscriber,
} from './telegram-store';
import {
  TELEGRAM_LIST_DEFAULT,
  clampListCount,
  chunkTelegramText,
  formatLeadListItem,
  formatLeadPush,
  formatOrderListItem,
  formatOrderPush,
  formatPhoneMovements,
  type PhoneMovement,
} from './telegram-format';

export type TelegramContext = {
  userId: string;
  chatId: string;
  username?: string;
  firstName?: string;
  text?: string;
  callbackData?: string;
  messageId?: number;
};

export type TelegramReplyMarkup = {
  keyboard?: Array<Array<{ text: string }>>;
  inline_keyboard?: Array<Array<{ text: string; callback_data: string }>>;
  resize_keyboard?: boolean;
  one_time_keyboard?: boolean;
};

export type TelegramReply = {
  text: string;
  replyMarkup?: TelegramReplyMarkup;
  /** Edit the callback message instead of sending a new one. */
  edit?: boolean;
};

export type TelegramHandlerResult = {
  replies: TelegramReply[];
  callbackAnswer?: string;
};

type PendingKind = 'find' | 'leads-n' | 'orders-n';

type PendingEntry = { kind: PendingKind; at: number };

const PENDING_TTL_MS = 2 * 60 * 1000;
const pending = new Map<string, PendingEntry>();

export function resetTelegramPending(): void {
  pending.clear();
}

function setPending(userId: string, kind: PendingKind): void {
  pending.set(userId, { kind, at: Date.now() });
}

function clearPending(userId: string): void {
  pending.delete(userId);
}

function peekPending(userId: string): PendingKind | null {
  const row = pending.get(userId);
  if (!row) return null;
  if (Date.now() - row.at > PENDING_TTL_MS) {
    pending.delete(userId);
    return null;
  }
  return row.kind;
}

export const ADMIN_REPLY_KEYBOARD: TelegramReplyMarkup = {
  keyboard: [[{ text: 'Меню' }], [{ text: 'Записи' }, { text: 'Продажі' }], [{ text: 'Пошук' }]],
  resize_keyboard: true,
};

export const MENU_TEXT = [
  'B_You · меню адміністратора',
  '',
  'Записи / продажі — останні 10, або 5 / 25 / 50 кнопками, або /leads 15.',
  'Пошук — усі рухи номера з датою і часом.',
].join('\n');

export const HELP_TEXT = [
  'Адмін-бот B_You. Лише для адміністраторів сайту.',
  '',
  'Кнопка Меню — записи, продажі, пошук, підписка.',
  'Пуші: новий запис / заявка / продаж — за вашою підпискою.',
  '',
  '/leads [n] — останні записи (1–50, типово 10)',
  '/orders [n] — останні продажі',
  '/find 067… — усі рухи номера',
  '/menu — це меню',
  '/sub — записи / замовлення / усе',
  '/mute /unmute',
].join('\n');

export function mainMenuKeyboard(): TelegramReplyMarkup {
  return {
    inline_keyboard: [
      [
        { text: 'Останні записи', callback_data: 'menu:leads' },
        { text: 'Останні продажі', callback_data: 'menu:orders' },
      ],
      [{ text: 'Пошук по телефону', callback_data: 'menu:find' }],
      [
        { text: 'Підписка', callback_data: 'menu:sub' },
        { text: 'Допомога', callback_data: 'menu:help' },
      ],
    ],
  };
}

function listNavKeyboard(kind: 'leads' | 'orders'): TelegramReplyMarkup {
  return {
    inline_keyboard: [
      [
        { text: '5', callback_data: `list:${kind}:5` },
        { text: '10', callback_data: `list:${kind}:10` },
        { text: '25', callback_data: `list:${kind}:25` },
        { text: '50', callback_data: `list:${kind}:50` },
      ],
      [{ text: 'Своє число', callback_data: `list:${kind}:custom` }],
      [{ text: '« Меню', callback_data: 'menu:home' }],
    ],
  };
}

function searchNavKeyboard(): TelegramReplyMarkup {
  return {
    inline_keyboard: [
      [{ text: 'Шукати ще', callback_data: 'menu:find' }],
      [{ text: '« Меню', callback_data: 'menu:home' }],
    ],
  };
}

function findPromptKeyboard(): TelegramReplyMarkup {
  return {
    inline_keyboard: [[{ text: '« Меню', callback_data: 'menu:home' }]],
  };
}

function subKeyboard(sub: TelegramSubscriber): TelegramReplyMarkup {
  const bookings = sub.bookings !== false ? '✓ ' : '';
  const orders = sub.orders !== false ? '✓ ' : '';
  const mute = sub.mute ? '✓ ' : '';
  return {
    inline_keyboard: [
      [
        { text: `${bookings}Записи`, callback_data: 'sub:bookings' },
        { text: `${orders}Замовлення`, callback_data: 'sub:orders' },
      ],
      [
        { text: 'Усе', callback_data: 'sub:all' },
        { text: `${mute}Mute`, callback_data: 'sub:mute' },
      ],
      [{ text: '« Меню', callback_data: 'menu:home' }],
    ],
  };
}

function prefsText(sub: TelegramSubscriber): string {
  const types = [
    sub.bookings !== false ? 'записи/заявки' : '',
    sub.orders !== false ? 'продажі' : '',
  ].filter(Boolean);
  const what = types.length ? types.join(' + ') : 'нічого';
  return `Підписка: ${what}${sub.mute ? ' · mute' : ''}`;
}

function repliesFromText(text: string, replyMarkup?: TelegramReplyMarkup, edit?: boolean): TelegramReply[] {
  const chunks = chunkTelegramText(text);
  if (!chunks.length) return [];
  if (chunks.length > 1) {
    return chunks.map((chunk, i) => ({
      text: chunk,
      replyMarkup: i === chunks.length - 1 ? replyMarkup : undefined,
    }));
  }
  return [{ text: chunks[0], replyMarkup, edit }];
}

function menuScreen(edit?: boolean): TelegramReply {
  return { text: MENU_TEXT, replyMarkup: mainMenuKeyboard(), edit };
}

function looksLikePhoneQuery(text: string): boolean {
  return phoneDigits(text).length >= 9;
}

function extractPairingCode(text: string): string | null {
  const t = text.trim();
  const start = t.match(/^\/start(?:@\w+)?(?:\s+(.+))?$/i);
  if (start) {
    const code = (start[1] || '').trim();
    return code || null;
  }
  if (/^\d{6}$/.test(t)) return t;
  return null;
}

function parseSlashCount(text: string, cmd: string): number | null {
  const re = new RegExp(`^/${cmd}(?:@\\w+)?(?:\\s+(\\d+))?\\s*$`, 'i');
  const m = text.match(re);
  if (!m) return null;
  if (!m[1]) return TELEGRAM_LIST_DEFAULT;
  return clampListCount(m[1]);
}

export type TelegramCommandDeps = {
  getSubscriber: (userId: string) => Promise<TelegramSubscriber | null>;
  consumePairing: (
    code: string,
    profile: { userId: string; chatId: string; username?: string; firstName?: string },
  ) => Promise<ConsumePairingResult>;
  patchSubscriber: (
    userId: string,
    patch: Partial<Pick<TelegramSubscriber, 'mute' | 'bookings' | 'orders'>>,
  ) => Promise<TelegramSubscriber | null>;
  listLeads: () => Promise<Lead[]>;
  listOrders: () => Promise<Order[]>;
};

export const defaultTelegramCommandDeps: TelegramCommandDeps = {
  getSubscriber: getTelegramSubscriber,
  consumePairing: consumeTelegramPairing,
  patchSubscriber: patchTelegramSubscriber,
  listLeads,
  listOrders,
};

function findMovements(leads: Lead[], orders: Order[], phone: string): PhoneMovement[] {
  const leadRows: PhoneMovement[] = leads
    .filter((l) => phonesMatch(l.phone, phone))
    .map((l) => ({
      kind: l.source === 'booking' ? 'booking' : 'callback',
      at: l.createdAt,
      detail: [l.serviceTitle, l.comment].filter(Boolean).join(' · ') || undefined,
    }));
  const orderRows: PhoneMovement[] = orders
    .filter((o) => phonesMatch(o.phone, phone))
    .map((o) => ({
      kind: 'order' as const,
      at: o.createdAt,
      detail:
        [
          o.items?.length ? o.items.map((i) => `${i.title} ×${i.qty}`).join(', ') : o.product.title,
          o.comment,
        ]
          .filter(Boolean)
          .join(' · ') || undefined,
    }));
  return [...leadRows, ...orderRows].sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
}

async function listLeadsText(deps: TelegramCommandDeps, n: number): Promise<string> {
  const leads = await deps.listLeads();
  const slice = leads.slice(0, n);
  if (!slice.length) return 'Записів немає.';
  const hint = 'Кількість: 5 / 10 / 25 / 50 або /leads 15';
  return [`Останні записи (${slice.length} з ${leads.length})`, hint, '', slice.map((l, i) => formatLeadListItem(l, i + 1)).join('\n\n')].join(
    '\n',
  );
}

async function listOrdersText(deps: TelegramCommandDeps, n: number): Promise<string> {
  const orders = await deps.listOrders();
  const slice = orders.slice(0, n);
  if (!slice.length) return 'Продажів немає.';
  const hint = 'Кількість: 5 / 10 / 25 / 50 або /orders 15';
  return [
    `Останні продажі (${slice.length} з ${orders.length})`,
    hint,
    '',
    slice.map((o, i) => formatOrderListItem(o, i + 1)).join('\n\n'),
  ].join('\n');
}

async function listReplies(
  deps: TelegramCommandDeps,
  kind: 'leads' | 'orders',
  n: number,
  edit?: boolean,
): Promise<TelegramReply[]> {
  const body = kind === 'leads' ? await listLeadsText(deps, n) : await listOrdersText(deps, n);
  return repliesFromText(body, listNavKeyboard(kind), edit);
}

async function searchReplies(
  deps: TelegramCommandDeps,
  phone: string,
  edit?: boolean,
): Promise<TelegramReply[]> {
  const [leads, orders] = await Promise.all([deps.listLeads(), deps.listOrders()]);
  const items = findMovements(leads, orders, phone);
  return repliesFromText(formatPhoneMovements(phone, items), searchNavKeyboard(), edit);
}

function findPrompt(edit?: boolean): TelegramReply {
  return {
    text: 'Введіть номер телефону (067… або +380…).\nПокажу всі записи і продажі цього номера з датою і часом.',
    replyMarkup: findPromptKeyboard(),
    edit,
  };
}

function isMenuText(lower: string): boolean {
  return lower === 'меню' || lower === 'menu' || /^\/menu\b/i.test(lower);
}

export async function handleTelegramContext(
  ctx: TelegramContext,
  deps: TelegramCommandDeps = defaultTelegramCommandDeps,
): Promise<TelegramHandlerResult> {
  const userId = String(ctx.userId || '').trim();
  const chatId = String(ctx.chatId || '').trim();
  if (!userId || !chatId) return { replies: [] };

  const rl = rateLimit(`tg:${userId}`, { limit: 20, windowMs: 60_000 });
  if (!rl.allowed) {
    return { replies: [{ text: 'Забагато запитів. Зачекайте хвилину.' }], callbackAnswer: 'Rate limit' };
  }

  const text = (ctx.text || '').trim();
  const callbackData = (ctx.callbackData || '').trim();
  const sub = await deps.getSubscriber(userId);

  if (!sub) {
    const code = extractPairingCode(text);
    if (code) {
      const result = await deps.consumePairing(code, {
        userId,
        chatId,
        username: ctx.username,
        firstName: ctx.firstName,
      });
      if (result === 'ok') {
        const linked = await deps.getSubscriber(userId);
        return {
          replies: [
            {
              text: `Підключено. ${linked ? prefsText(linked) : ''}\n\n${MENU_TEXT}`.trim(),
              replyMarkup: mainMenuKeyboard(),
            },
            { text: 'Клавіатура внизу: Меню · Записи · Продажі · Пошук', replyMarkup: ADMIN_REPLY_KEYBOARD },
          ],
        };
      }
      return { replies: [{ text: 'Немає доступу.' }] };
    }
    if (/^\/start\b/i.test(text)) {
      return { replies: [{ text: 'Немає доступу.' }] };
    }
    return { replies: [] };
  }

  if (callbackData === 'menu:home') {
    clearPending(userId);
    return { replies: [menuScreen(true)], callbackAnswer: 'Меню' };
  }
  if (callbackData === 'menu:leads') {
    clearPending(userId);
    return { replies: await listReplies(deps, 'leads', TELEGRAM_LIST_DEFAULT, true), callbackAnswer: 'Записи' };
  }
  if (callbackData === 'menu:orders') {
    clearPending(userId);
    return { replies: await listReplies(deps, 'orders', TELEGRAM_LIST_DEFAULT, true), callbackAnswer: 'Продажі' };
  }
  if (callbackData === 'menu:find') {
    setPending(userId, 'find');
    return { replies: [findPrompt(true)], callbackAnswer: 'Пошук' };
  }
  if (callbackData === 'menu:sub') {
    clearPending(userId);
    return { replies: [{ text: prefsText(sub), replyMarkup: subKeyboard(sub), edit: true }], callbackAnswer: 'Підписка' };
  }
  if (callbackData === 'menu:help') {
    clearPending(userId);
    return {
      replies: [{ text: `${prefsText(sub)}\n\n${HELP_TEXT}`, replyMarkup: mainMenuKeyboard(), edit: true }],
      callbackAnswer: 'Допомога',
    };
  }

  if (callbackData.startsWith('list:')) {
    const parts = callbackData.split(':');
    const kind = parts[1] === 'orders' ? 'orders' : parts[1] === 'leads' ? 'leads' : null;
    const raw = parts[2];
    if (!kind) return { replies: [menuScreen(true)], callbackAnswer: 'OK' };
    if (raw === 'custom') {
      setPending(userId, kind === 'leads' ? 'leads-n' : 'orders-n');
      return {
        replies: [
          {
            text: `Скільки останніх ${kind === 'leads' ? 'записів' : 'продажів'} показати? Надішліть число від 1 до 50.`,
            replyMarkup: findPromptKeyboard(),
            edit: true,
          },
        ],
        callbackAnswer: 'Число',
      };
    }
    const n = clampListCount(raw);
    return {
      replies: await listReplies(deps, kind, n, true),
      callbackAnswer: kind === 'leads' ? `Записи: ${n}` : `Продажі: ${n}`,
    };
  }

  if (callbackData.startsWith('sub:')) {
    const mode = callbackData.slice(4);
    let next = sub;
    if (mode === 'bookings') {
      next = (await deps.patchSubscriber(userId, { bookings: true, orders: false, mute: false })) || sub;
    } else if (mode === 'orders') {
      next = (await deps.patchSubscriber(userId, { bookings: false, orders: true, mute: false })) || sub;
    } else if (mode === 'all') {
      next = (await deps.patchSubscriber(userId, { bookings: true, orders: true, mute: false })) || sub;
    } else if (mode === 'mute') {
      next = (await deps.patchSubscriber(userId, { mute: !sub.mute })) || sub;
    }
    return {
      replies: [{ text: prefsText(next), replyMarkup: subKeyboard(next), edit: true }],
      callbackAnswer: 'Збережено',
    };
  }

  const waiting = peekPending(userId);
  if (waiting === 'find' && text && !text.startsWith('/') && looksLikePhoneQuery(text)) {
    clearPending(userId);
    return { replies: await searchReplies(deps, text) };
  }
  if ((waiting === 'leads-n' || waiting === 'orders-n') && text && /^\d{1,3}$/.test(text)) {
    clearPending(userId);
    const n = clampListCount(text);
    return { replies: await listReplies(deps, waiting === 'leads-n' ? 'leads' : 'orders', n) };
  }
  if (waiting && text) {
    clearPending(userId);
  }

  const lower = text.toLowerCase();

  if (isMenuText(lower) || lower === 'допомога' || /^\/help\b/i.test(text)) {
    const help = lower === 'допомога' || /^\/help\b/i.test(text);
    if (help) {
      return {
        replies: [
          { text: `${prefsText(sub)}\n\n${HELP_TEXT}`, replyMarkup: mainMenuKeyboard() },
          { text: 'Клавіатура внизу.', replyMarkup: ADMIN_REPLY_KEYBOARD },
        ],
      };
    }
    return {
      replies: [menuScreen(), { text: 'Клавіатура внизу: Меню · Записи · Продажі · Пошук', replyMarkup: ADMIN_REPLY_KEYBOARD }],
    };
  }

  if (/^\/mute\b/i.test(text)) {
    const next = (await deps.patchSubscriber(userId, { mute: true })) || sub;
    return { replies: [{ text: prefsText(next), replyMarkup: mainMenuKeyboard() }] };
  }
  if (/^\/unmute\b/i.test(text)) {
    const next = (await deps.patchSubscriber(userId, { mute: false })) || sub;
    return { replies: [{ text: prefsText(next), replyMarkup: mainMenuKeyboard() }] };
  }

  if (/^\/sub(?:scribe)?\b/i.test(text) || lower === 'підписка' || lower === 'подписка') {
    return { replies: [{ text: prefsText(sub), replyMarkup: subKeyboard(sub) }] };
  }

  const leadsN = parseSlashCount(text, 'leads') ?? parseSlashCount(text, 'bookings');
  if (
    leadsN != null ||
    lower === 'останні записи' ||
    lower === 'записи' ||
    lower === 'запис'
  ) {
    const n = leadsN ?? TELEGRAM_LIST_DEFAULT;
    return { replies: await listReplies(deps, 'leads', n) };
  }

  const ordersN = parseSlashCount(text, 'orders') ?? parseSlashCount(text, 'sales');
  if (
    ordersN != null ||
    lower === 'останні замовлення' ||
    lower === 'замовлення' ||
    lower === 'продажі' ||
    lower === 'продаж'
  ) {
    const n = ordersN ?? TELEGRAM_LIST_DEFAULT;
    return { replies: await listReplies(deps, 'orders', n) };
  }

  const findMatch = text.match(/^\/find(?:@\w+)?(?:\s+(.+))?$/i);
  if (findMatch || lower === 'пошук' || lower === 'поиск' || lower === 'пошук по телефону') {
    const phone = (findMatch?.[1] || '').trim();
    if (!phone) {
      setPending(userId, 'find');
      return { replies: [findPrompt()] };
    }
    return { replies: await searchReplies(deps, phone) };
  }

  if (looksLikePhoneQuery(text) && !text.startsWith('/')) {
    return { replies: await searchReplies(deps, text) };
  }

  if (/^\/start\b/i.test(text)) {
    const code = extractPairingCode(text);
    if (code) {
      await deps.consumePairing(code, {
        userId,
        chatId,
        username: ctx.username,
        firstName: ctx.firstName,
      });
    }
    return {
      replies: [
        { text: `Вже підключено. ${prefsText(sub)}\n\n${MENU_TEXT}`, replyMarkup: mainMenuKeyboard() },
        { text: 'Клавіатура внизу.', replyMarkup: ADMIN_REPLY_KEYBOARD },
      ],
    };
  }

  if (text.startsWith('/')) {
    return {
      replies: [{ text: 'Невідома команда. Натисніть Меню.', replyMarkup: mainMenuKeyboard() }],
    };
  }

  return { replies: [] };
}

export function previewLead(lead: Lead): string {
  return formatLeadPush({
    phone: lead.phone,
    source: lead.source,
    serviceTitle: lead.serviceTitle,
    comment: lead.comment,
    createdAt: lead.createdAt,
  });
}

export function previewOrder(order: Order): string {
  return formatOrderPush({
    phone: order.phone,
    productTitle: order.items?.length
      ? order.items.map((i) => `${i.title} ×${i.qty}`).join(', ')
      : order.product.title,
    price: order.total ?? order.product.price,
    fulfillment: order.fulfillment,
    comment: order.comment,
    createdAt: order.createdAt,
  });
}
