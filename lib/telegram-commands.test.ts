import { beforeEach, describe, expect, it } from 'vitest';
import type { Lead } from './leads';
import type { Order } from './orders';
import {
  handleTelegramContext,
  resetTelegramPending,
  type TelegramCommandDeps,
} from './telegram-commands';
import type { TelegramSubscriber } from './telegram-store';

function lead(partial: Partial<Lead> & Pick<Lead, 'phone'>): Lead {
  return {
    id: partial.id || 'l1',
    phone: partial.phone,
    createdAt: partial.createdAt || '2026-09-06T10:00:00.000Z',
    source: partial.source || 'booking',
    emailed: false,
    handled: false,
    comment: partial.comment,
    serviceTitle: partial.serviceTitle,
  };
}

function order(partial: Partial<Order> & Pick<Order, 'phone'>): Order {
  return {
    id: partial.id || 'o1',
    createdAt: partial.createdAt || '2026-09-06T11:00:00.000Z',
    phone: partial.phone,
    quantity: 1,
    product: partial.product || { id: 'p1', title: 'Шампунь', price: 100 },
    source: 'shop',
    emailed: false,
    handled: false,
    comment: partial.comment,
  };
}

describe('telegram-commands', () => {
  let sub: TelegramSubscriber | null;
  let pairingOk: boolean;
  let leads: Lead[];
  let orders: Order[];
  let deps: TelegramCommandDeps;

  beforeEach(() => {
    resetTelegramPending();
    sub = {
      userId: '9',
      chatId: '90',
      linkedAt: '2026-09-01T00:00:00.000Z',
      mute: false,
      bookings: true,
      orders: true,
    };
    pairingOk = true;
    leads = [
      lead({ phone: '+380501112233', source: 'booking', serviceTitle: 'Манікюр', comment: 'після 18' }),
      lead({ id: 'l2', phone: '+380671110000', source: 'callback', createdAt: '2026-09-05T10:00:00.000Z' }),
    ];
    orders = [order({ phone: '+380501112233', comment: 'завтра' })];
    deps = {
      getSubscriber: async (id) => (sub && sub.userId === id ? sub : null),
      consumePairing: async () => (pairingOk ? 'ok' : 'invalid'),
      patchSubscriber: async (_id, patch) => {
        if (!sub) return null;
        sub = { ...sub, ...patch };
        return sub;
      },
      listLeads: async () => leads,
      listOrders: async () => orders,
      getSettings: async () => ({
        quietStart: 22,
        quietEnd: 8,
        timezone: 'Europe/Kyiv',
      }),
      claimItem: async (kind, id, assignee) => {
        const item = kind === 'lead' ? leads.find((l) => l.id === id) : orders.find((o) => o.id === id);
        if (!item) return { ok: false, reason: 'not_found' };
        if (item.assignee && item.assignee !== assignee) {
          return { ok: false, reason: 'taken', assignee: item.assignee };
        }
        item.status = 'in_progress';
        item.assignee = assignee;
        return { ok: true, kind, item };
      },
    };
  });

  it('ignores strangers and denies invalid /start', async () => {
    const silent = await handleTelegramContext(
      { userId: '1', chatId: '2', text: '/leads' },
      { ...deps, getSubscriber: async () => null },
    );
    expect(silent.replies).toEqual([]);

    const denied = await handleTelegramContext(
      { userId: '1', chatId: '2', text: '/start 111111' },
      { ...deps, getSubscriber: async () => null, consumePairing: async () => 'invalid' },
    );
    expect(denied.replies[0]?.text).toMatch(/Немає доступу/);
  });

  it('pairs admin with a one-time code', async () => {
    const local: { current: TelegramSubscriber | null } = { current: null };
    const result = await handleTelegramContext(
      { userId: '9', chatId: '90', text: '/start 123456', username: 'boss' },
      {
        ...deps,
        getSubscriber: async () => local.current,
        consumePairing: async () => {
          local.current = sub;
          return 'ok';
        },
      },
    );
    expect(result.replies[0]?.text).toMatch(/Підключено/);
    expect(result.replies[0]?.replyMarkup?.inline_keyboard).toBeTruthy();
    expect(result.replies[1]?.replyMarkup?.keyboard).toBeTruthy();
  });

  it('lists last leads and respects custom n', async () => {
    const ten = await handleTelegramContext({ userId: '9', chatId: '90', text: '/leads' }, deps);
    expect(ten.replies).toHaveLength(1);
    expect(ten.replies[0]?.text).toMatch(/Останні записи/);
    expect(ten.replies[0]?.text).toMatch(/Манікюр/);
    const counts = ten.replies[0]?.replyMarkup?.inline_keyboard?.[0]?.map((b) => b.text);
    expect(counts).toEqual(['5', '10', '25', '50']);

    const custom = await handleTelegramContext({ userId: '9', chatId: '90', text: '/leads 15' }, deps);
    expect(custom.replies[0]?.text).toMatch(/\(2 з 2\)/);
    expect(custom.replies[0]?.text).toMatch(/\/leads 15/);

    const one = await handleTelegramContext({ userId: '9', chatId: '90', text: '/leads 1' }, deps);
    expect(one.replies[0]?.text).toMatch(/\(1 з 2\)/);
    expect(one.replies[0]?.text).not.toMatch(/671110000/);
  });

  it('opens button menu and lists orders from count pads', async () => {
    const menu = await handleTelegramContext({ userId: '9', chatId: '90', text: 'Меню' }, deps);
    expect(menu.replies[0]?.text).toMatch(/черга адміністратора/);
    expect(menu.replies[0]?.replyMarkup?.inline_keyboard?.[0]?.map((b) => b.callback_data)).toEqual([
      'menu:leads',
      'menu:orders',
    ]);
    expect(menu.replies[0]?.replyMarkup?.inline_keyboard?.[1]?.[0]?.callback_data).toBe('menu:find');

    const fromMenu = await handleTelegramContext({ userId: '9', chatId: '90', callbackData: 'menu:orders' }, deps);
    expect(fromMenu.replies[0]?.text).toMatch(/Продаж/);
    expect(fromMenu.replies[0]?.edit).toBe(true);

    const btn = await handleTelegramContext({ userId: '9', chatId: '90', text: 'Продажі' }, deps);
    expect(btn.replies[0]?.text).toMatch(/Продаж/);
    const cb = await handleTelegramContext({ userId: '9', chatId: '90', callbackData: 'list:orders:5' }, deps);
    expect(cb.replies[0]?.text).toMatch(/Шампунь/);
    expect(cb.callbackAnswer).toMatch(/Продажі/);
    expect(cb.replies[0]?.edit).toBe(true);
  });

  it('searches by phone across leads and orders', async () => {
    const found = await handleTelegramContext({ userId: '9', chatId: '90', text: '/find 0501112233' }, deps);
    expect(found.replies[0]?.text).toMatch(/Усі рухи/);
    expect(found.replies[0]?.text).toMatch(/Запис/);
    expect(found.replies[0]?.text).toMatch(/Продаж/);
    expect(found.replies[0]?.text).not.toMatch(/671110000/);
    const findBtn = found.replies[0]?.replyMarkup?.inline_keyboard?.flat().find((b) => b.callback_data === 'menu:find');
    expect(findBtn?.callback_data).toBe('menu:find');

    const typed = await handleTelegramContext({ userId: '9', chatId: '90', text: '+380501112233' }, deps);
    expect(typed.replies[0]?.text).toMatch(/Усі рухи/);

    const prompt = await handleTelegramContext({ userId: '9', chatId: '90', callbackData: 'menu:find' }, deps);
    expect(prompt.replies[0]?.text).toMatch(/номер телефону/);
    const after = await handleTelegramContext({ userId: '9', chatId: '90', text: '0501112233' }, deps);
    expect(after.replies[0]?.text).toMatch(/Манікюр/);
  });

  it('updates subscription prefs', async () => {
    const res = await handleTelegramContext({ userId: '9', chatId: '90', callbackData: 'sub:orders' }, deps);
    expect(res.replies[0]?.text).toMatch(/продажі/);
    expect(res.replies[0]?.text).not.toMatch(/записи/);
    expect(sub?.bookings).toBe(false);
    expect(sub?.orders).toBe(true);
  });

  it('shows quiet hours and confirms claim only', async () => {
    const quiet = await handleTelegramContext({ userId: '9', chatId: '90', text: '/quiet' }, deps);
    expect(quiet.replies[0]?.text).toMatch(/22:00–08:00/);

    const ask = await handleTelegramContext(
      { userId: '9', chatId: '90', firstName: 'Ira', callbackData: 'claim:ask:l:l1' },
      deps,
    );
    expect(ask.replies[0]?.text).toMatch(/Підтвердити/);
    expect(ask.replies[0]?.replyMarkup?.inline_keyboard?.[0]?.map((b) => b.callback_data)).toEqual([
      'claim:yes:l:l1',
      'claim:no:l:l1',
    ]);

    const yes = await handleTelegramContext(
      { userId: '9', chatId: '90', firstName: 'Ira', callbackData: 'claim:yes:l:l1' },
      deps,
    );
    expect(yes.callbackAnswer).toBe('Взято');
    expect(yes.replies[0]?.text).toMatch(/В роботі/);
    expect(yes.replies[0]?.text).toMatch(/Ira/);
    expect(leads[0]?.assignee).toBe('Ira');

    const done = await handleTelegramContext(
      { userId: '9', chatId: '90', callbackData: 'done:l:l1' },
      deps,
    );
    expect(done.replies).toEqual([]);
  });
});
