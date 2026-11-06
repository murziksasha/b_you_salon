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

  it('navigates menu, lists leads/orders with default and custom count', async () => {
    const menu = await handleTelegramContext({ userId: '9', chatId: '90', text: 'меню' }, deps);
    expect(menu.replies[0]?.text).toMatch(/B_You/);
    expect(menu.replies[0]?.replyMarkup?.inline_keyboard).toBeTruthy();

    const leadsRes = await handleTelegramContext({ userId: '9', chatId: '90', text: '/leads' }, deps);
    expect(leadsRes.replies[0]?.text).toMatch(/Останні записи \(2 з 2\)/);
    expect(leadsRes.replies[0]?.text).toMatch(/Манікюр/);

    const ordersRes = await handleTelegramContext({ userId: '9', chatId: '90', text: '/orders 1' }, deps);
    expect(ordersRes.replies[0]?.text).toMatch(/Останні продажі \(1 з 1\)/);
    expect(ordersRes.replies[0]?.text).toMatch(/Шампунь/);

    const listCb = await handleTelegramContext({ userId: '9', chatId: '90', callbackData: 'list:leads:5' }, deps);
    expect(listCb.callbackAnswer).toBe('Записи: 5');

    const customAsk = await handleTelegramContext(
      { userId: '9', chatId: '90', callbackData: 'list:leads:custom' },
      deps,
    );
    expect(customAsk.replies[0]?.text).toMatch(/Скільки останніх записів/);
    const customNum = await handleTelegramContext({ userId: '9', chatId: '90', text: '15' }, deps);
    expect(customNum.replies[0]?.text).toMatch(/Останні записи/);
  });

  it('searches full movements for phone query', async () => {
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

  it('shows quiet hours and ignores legacy mutation/claim callbacks', async () => {
    const quiet = await handleTelegramContext({ userId: '9', chatId: '90', text: '/quiet' }, deps);
    expect(quiet.replies[0]?.text).toMatch(/22:00–08:00/);

    const legacyClaim = await handleTelegramContext(
      { userId: '9', chatId: '90', firstName: 'Ira', callbackData: 'claim:ask:l:l1' },
      deps,
    );
    expect(legacyClaim.replies).toEqual([]);

    const done = await handleTelegramContext(
      { userId: '9', chatId: '90', callbackData: 'done:l:l1' },
      deps,
    );
    expect(done.replies).toEqual([]);
    expect(leads[0]?.assignee).toBeUndefined();
  });
});
