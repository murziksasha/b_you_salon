import { describe, expect, it } from 'vitest';
import { buildCatchupDigest } from './process-digest';
import type { Lead } from './leads';
import type { Order } from './orders';

function lead(partial: Partial<Lead> & Pick<Lead, 'id' | 'phone' | 'createdAt'>): Lead {
  return {
    source: 'callback',
    emailed: false,
    handled: false,
    status: 'new',
    ...partial,
  };
}

function order(partial: Partial<Order> & Pick<Order, 'id' | 'phone' | 'createdAt'>): Order {
  return {
    quantity: 1,
    product: { id: 'p1', title: 'Шампунь', price: 100 },
    source: 'shop',
    emailed: false,
    handled: false,
    status: 'new',
    ...partial,
  };
}

describe('process-digest catch-up', () => {
  it('returns null when nothing new and nothing open', () => {
    const leads = [
      lead({
        id: 'l1',
        phone: '+380671111111',
        createdAt: '2026-09-01T10:00:00.000Z',
        handled: true,
        status: 'done',
      }),
    ];
    expect(buildCatchupDigest(leads, [], '2026-09-06T08:00:00.000Z')).toBeNull();
  });

  it('counts items newer than since and current open queue', () => {
    const leads = [
      lead({ id: 'old', phone: '+380671111111', createdAt: '2026-09-01T10:00:00.000Z', status: 'done', handled: true }),
      lead({ id: 'new', phone: '+380672222222', createdAt: '2026-09-06T09:00:00.000Z' }),
    ];
    const orders = [order({ id: 'o1', phone: '+380673333333', createdAt: '2026-09-06T09:30:00.000Z' })];
    const text = buildCatchupDigest(leads, orders, '2026-09-06T08:00:00.000Z');
    expect(text).toMatch(/Поки хост спав/);
    expect(text).toMatch(/Нових: 2 \(записи 1, продажі 1\)/);
    expect(text).toMatch(/Відкрито зараз: 2/);
  });
});
