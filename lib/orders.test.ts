import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ordersFilePath, purgeExpiredOrders } from './orders';
import { CLOSE_OUTCOMES, WORKFLOW_STATUSES } from './workflow';

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
    const { createOrder, listOrders, updateOrder, deleteOrder, countOrders } = await import('./orders');

    const a = await createOrder({
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
    const { createOrder } = await import('./orders');
    const o = await createOrder({
      phone: '+380501112233',
      comment: '   ',
      emailed: true,
      product: { id: 'x', title: 'X', price: 1 },
    });
    expect(o.comment).toBeUndefined();
    expect(o.emailed).toBe(true);
  });

  it('stores a shop consult without catalog items', async () => {
    const { createOrder, listOrders } = await import('./orders');
    const o = await createOrder({
      phone: '+380501112233',
      comment: 'хочу сироватку',
      emailed: false,
      source: 'consult',
    });
    expect(o.source).toBe('consult');
    expect(o.product.id).toBe('consult');
    expect(o.product.title).toBe('Консультація по товарах');
    expect(o.total).toBe(0);
    expect(o.items?.[0]?.id).toBe('consult');
    expect((await listOrders())[0].source).toBe('consult');
  });

  it('stores multi-item cart snapshot and fulfillment', async () => {
    const { createOrder, listOrders } = await import('./orders');
    const o = await createOrder({
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

  it('propagates error on corrupt JSON and preserves file', async () => {
    const { listOrders } = await import('./orders');
    await fs.writeFile(ordersFilePath(), '{ bad json orders ...', 'utf-8');
    await expect(listOrders()).rejects.toThrow();
    const content = await fs.readFile(ordersFilePath(), 'utf-8');
    expect(content).toBe('{ bad json orders ...');
  });

  it('respects statutory tax hold by default and purges only when explicitly enabled', async () => {
    const { createOrder, updateOrder, listOrders } = await import('./orders');
    const now = new Date('2026-11-04T12:00:00Z').getTime();

    // 1. Handled 4 years ago (1400 days)
    const o1 = await createOrder({
      phone: '+380500000001',
      emailed: false,
      product: { id: 'p1', title: 'Test 1', price: 100 },
    });
    await updateOrder(o1.id, { handled: true });

    const raw = JSON.parse(await fs.readFile(ordersFilePath(), 'utf-8'));
    const old4y = new Date(now - 1400 * 24 * 3600 * 1000).toISOString();
    const recent6m = new Date(now - 6 * 30 * 24 * 3600 * 1000).toISOString();
    raw.orders[0].handledAt = old4y;
    raw.orders[0].status = 'done';

    // 2. Handled 6 months ago -> RETAINED
    raw.orders.push({
      id: 'order-recent',
      phone: '+380500000002',
      createdAt: recent6m,
      source: 'shop',
      quantity: 1,
      product: { id: 'p2', title: 'Test 2', price: 100 },
      items: [{ id: 'p2', title: 'Test 2', price: 100, qty: 1 }],
      total: 100,
      fulfillment: 'pickup',
      emailed: true,
      handled: true,
      status: 'done',
      handledAt: recent6m,
    });

    // 3. Open order from 4 years ago -> RETAINED
    raw.orders.push({
      id: 'order-open-old',
      phone: '+380500000003',
      createdAt: old4y,
      source: 'shop',
      quantity: 1,
      product: { id: 'p3', title: 'Test 3', price: 100 },
      items: [{ id: 'p3', title: 'Test 3', price: 100, qty: 1 }],
      total: 100,
      fulfillment: 'pickup',
      emailed: true,
      handled: false,
      status: 'new',
    });

    // 4. Closed order without handledAt (legacy) -> RETAINED
    raw.orders.push({
      id: 'order-legacy-undated',
      phone: '+380500000004',
      createdAt: old4y,
      source: 'shop',
      quantity: 1,
      product: { id: 'p4', title: 'Test 4', price: 100 },
      items: [{ id: 'p4', title: 'Test 4', price: 100, qty: 1 }],
      total: 100,
      fulfillment: 'pickup',
      emailed: true,
      handled: true,
      status: 'done',
    });

    await fs.writeFile(ordersFilePath(), JSON.stringify(raw), 'utf-8');

    // Default call: statutory tax hold prevents all deletions
    const defaultHoldResult = await purgeExpiredOrders(now);
    expect(defaultHoldResult.purgedCount).toBe(0);
    expect(defaultHoldResult.retainedCount).toBe(4);

    // Explicit opt-in: purges expired order (>1095 days)
    const result = await purgeExpiredOrders(now, { ordersPurgeEnabled: true });
    expect(result.purgedCount).toBe(1);
    expect(result.retainedCount).toBe(3);
    expect(result.undatedLegacyCount).toBe(1);

    const after = await listOrders();
    const ids = after.map(o => o.id);
    expect(ids).not.toContain(o1.id);
    expect(ids).toContain('order-recent');
    expect(ids).toContain('order-open-old');
    expect(ids).toContain('order-legacy-undated');
  });

  it('parses and saves every workflow status and close outcome', async () => {
    const { createOrder, updateOrder, listOrders } = await import('./orders');

    for (const status of WORKFLOW_STATUSES) {
      const order = await createOrder({
        phone: '+380501110001',
        emailed: false,
        product: { id: 'p-stat', title: 'Test', price: 100 },
      });
      const updated = await updateOrder(order.id, { status });
      expect(updated?.status).toBe(status);
    }

    for (const outcome of CLOSE_OUTCOMES) {
      const order = await createOrder({
        phone: '+380501110002',
        emailed: false,
        product: { id: 'p-out', title: 'Test', price: 100 },
      });
      const updated = await updateOrder(order.id, { outcome, status: 'done' });
      expect(updated?.outcome).toBe(outcome);
    }

    const all = await listOrders();
    expect(all.length).toBe(WORKFLOW_STATUSES.length + CLOSE_OUTCOMES.length);
  });

  it('preserves historical unknown fields during round-trip', async () => {
    const { updateOrder, listOrders } = await import('./orders');
    const legacyFixture = {
      orders: [
        {
          id: 'order-legacy-fields',
          phone: '+380509998877',
          createdAt: new Date().toISOString(),
          source: 'shop',
          quantity: 1,
          product: { id: 'p1', title: 'Product 1', price: 200, legacyCatalogId: 'cat-42' },
          items: [{ id: 'p1', title: 'Product 1', price: 200, qty: 1, vendorSku: 'SKU-99' }],
          emailed: false,
          handled: false,
          status: 'new',
          legacyPaymentMethod: 'cod',
          shippingNotes: 'leave at the door',
        },
      ],
    };
    await fs.writeFile(ordersFilePath(), JSON.stringify(legacyFixture), 'utf-8');

    await updateOrder('order-legacy-fields', { note: 'verified order' });
    const stored = JSON.parse(await fs.readFile(ordersFilePath(), 'utf-8'));
    expect(stored.orders[0].legacyPaymentMethod).toBe('cod');
    expect(stored.orders[0].shippingNotes).toBe('leave at the door');
    expect(stored.orders[0].product.legacyCatalogId).toBe('cat-42');
    expect(stored.orders[0].items[0].vendorSku).toBe('SKU-99');
    expect(stored.orders[0].note).toBe('verified order');
  });

  it('fails closed with actionable error on corrupt record types', async () => {
    const { listOrders } = await import('./orders');
    const corruptedFixture = {
      orders: [
        {
          id: 'corrupted-order',
          phone: 12345, // invalid type
          createdAt: new Date().toISOString(),
          source: 'shop',
          quantity: 'not-a-number',
          product: { id: 'p1', title: 'Test', price: 100 },
          emailed: false,
          handled: false,
        },
      ],
    };
    await fs.writeFile(ordersFilePath(), JSON.stringify(corruptedFixture), 'utf-8');
    await expect(listOrders()).rejects.toThrow(/Corrupted or invalid orders store/);
  });

  it('rejects unknown source instead of silently defaulting', async () => {
    const { listOrders } = await import('./orders');
    const badSourceFixture = {
      orders: [
        {
          id: 'bad-source-order',
          phone: '+380501112233',
          createdAt: new Date().toISOString(),
          source: 'invalid_order_source',
          quantity: 1,
          product: { id: 'p1', title: 'Test', price: 100 },
          emailed: false,
          handled: false,
        },
      ],
    };
    await fs.writeFile(ordersFilePath(), JSON.stringify(badSourceFixture), 'utf-8');
    await expect(listOrders()).rejects.toThrow(/Corrupted or invalid orders store/);
  });
});
