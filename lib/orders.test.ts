import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

describe('orders store', () => {
  let tmpDir: string;
  let prev: string | undefined;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ps-orders-'));
    prev = process.env.DATA_DIR;
    process.env.DATA_DIR = tmpDir;
  });

  afterEach(async () => {
    if (prev === undefined) delete process.env.DATA_DIR;
    else process.env.DATA_DIR = prev;
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('appends, updates, deletes orders with product snapshot', async () => {
    const { appendOrder, listOrders, updateOrder, deleteOrder, countOrders } = await import('./orders');

    const a = await appendOrder({
      phone: '+380501112233',
      comment: 'Під замовлення',
      emailed: false,
      product: { id: 'p1', title: 'Акумулятор', price: 800, code: 'АКБ-12' },
    });
    expect(a.id).toBeTruthy();
    expect(a.quantity).toBe(1);
    expect(a.source).toBe('shop');
    expect(a.product.title).toBe('Акумулятор');
    expect(a.comment).toBe('Під замовлення');
    expect(await countOrders({ unhandledOnly: true })).toBe(1);

    const updated = await updateOrder(a.id, { handled: true, note: 'called' });
    expect(updated?.handled).toBe(true);
    expect(updated?.note).toBe('called');
    expect(await countOrders({ unhandledOnly: true })).toBe(0);

    const list = await listOrders();
    expect(list).toHaveLength(1);

    expect(await deleteOrder(a.id)).toBe(true);
    expect(await listOrders()).toHaveLength(0);
  });

  it('omits empty comment', async () => {
    const { appendOrder } = await import('./orders');
    const o = await appendOrder({
      phone: '+380501112233',
      comment: '   ',
      emailed: true,
      product: { id: 'x', title: 'X', price: 1 },
    });
    expect(o.comment).toBeUndefined();
    expect(o.emailed).toBe(true);
  });

  it('stores multi-item cart snapshot and fulfillment', async () => {
    const { appendOrder, listOrders } = await import('./orders');
    const o = await appendOrder({
      phone: '+380501112233',
      emailed: false,
      fulfillment: 'delivery',
      address: 'вул. Тестова 1',
      items: [
        { id: 'p1', title: 'Сироватка', price: 100, qty: 2 },
        { id: 'p2', title: 'Крем', price: 50, qty: 1 },
      ],
    });
    expect(o.items).toHaveLength(2);
    expect(o.total).toBe(250);
    expect(o.fulfillment).toBe('delivery');
    expect(o.product.title).toBe('Сироватка');
    expect(listOrders).toBeTypeOf('function');
  });
});
