import { promises as fs } from 'fs';
import path from 'path';
import { atomicWriteJson } from './atomic-write';
import { createId } from './id';
import {
  handledFromStatus,
  isCloseOutcome,
  isWorkflowStatus,
  normalizeStatus,
  type CloseOutcome,
  type WorkflowStatus,
} from './workflow';

export interface OrderProductSnapshot {
  id: string;
  title: string;
  price: number;
  code?: string;
  image?: string;
}

export interface OrderItemSnapshot extends OrderProductSnapshot {
  qty: number;
}

export type Fulfillment = 'pickup' | 'delivery';

export interface OrderAuditEntry {
  at: string;
  action:
    | 'created'
    | 'handled'
    | 'reopened'
    | 'note'
    | 'status'
    | 'callback'
    | 'assign'
    | 'outcome';
  detail?: string;
}

export interface Order {
  id: string;
  createdAt: string;
  phone: string;
  comment?: string;
  name?: string;
  quantity: number;
  product: OrderProductSnapshot;
  items?: OrderItemSnapshot[];
  total?: number;
  fulfillment?: Fulfillment;
  address?: string;
  source: 'shop';
  emailed: boolean;
  handled: boolean;
  status?: WorkflowStatus;
  note?: string;
  outcome?: CloseOutcome;
  assignee?: string;
  claimedAt?: string;
  handledAt?: string;
  callbackAt?: string;
  audit?: OrderAuditEntry[];
  telegram?: boolean;
}

export interface OrdersStore {
  orders: Order[];
}

const MAX_ORDERS = 500;
const MAX_AUDIT = 30;

function dataRoot(): string {
  return process.env.DATA_DIR || path.join(process.cwd(), 'data');
}

export function ordersFilePath(): string {
  return path.join(dataRoot(), 'orders.json');
}

async function readStore(): Promise<OrdersStore> {
  try {
    const raw = await fs.readFile(ordersFilePath(), 'utf-8');
    const parsed = JSON.parse(raw) as OrdersStore;
    if (!parsed || !Array.isArray(parsed.orders)) return { orders: [] };
    return parsed;
  } catch {
    return { orders: [] };
  }
}

async function writeStore(store: OrdersStore): Promise<void> {
  await atomicWriteJson(ordersFilePath(), store);
}

function pushAudit(order: Order, entry: OrderAuditEntry): OrderAuditEntry[] {
  const list = [...(order.audit || []), entry];
  return list.slice(-MAX_AUDIT);
}

export function normalizeOrderShape(order: Order): Order {
  const items =
    order.items && order.items.length
      ? order.items.map((item) => ({
          ...item,
          qty: Math.max(1, Math.floor(Number(item.qty) || 1)),
        }))
      : order.product
        ? [{ ...order.product, qty: Math.max(1, Number(order.quantity) || 1) }]
        : [];
  const total =
    typeof order.total === 'number'
      ? order.total
      : items.reduce((sum, item) => sum + item.price * item.qty, 0);
  const first = items[0] || order.product;
  return {
    ...order,
    items,
    total,
    fulfillment: order.fulfillment === 'delivery' ? 'delivery' : 'pickup',
    quantity: items.reduce((sum, item) => sum + item.qty, 0) || order.quantity || 1,
    product: first
      ? {
          id: first.id,
          title: first.title,
          price: first.price,
          code: first.code,
          image: first.image,
        }
      : order.product,
  };
}

export function withNormalizedOrder(order: Order): Order {
  const shaped = normalizeOrderShape(order);
  const status = normalizeStatus(shaped.status, shaped.handled);
  return {
    ...shaped,
    status,
    handled: handledFromStatus(status),
  };
}

export async function listOrders(): Promise<Order[]> {
  const store = await readStore();
  return store.orders.map(withNormalizedOrder);
}

export async function countOrders(options?: { unhandledOnly?: boolean }): Promise<number> {
  const orders = await listOrders();
  if (options?.unhandledOnly) {
    return orders.filter((o) => !handledFromStatus(normalizeStatus(o.status, o.handled))).length;
  }
  return orders.length;
}

export async function appendOrder(input: {
  phone: string;
  comment?: string;
  name?: string;
  product?: OrderProductSnapshot;
  items?: OrderItemSnapshot[];
  fulfillment?: Fulfillment;
  address?: string;
  emailed: boolean;
  telegram?: boolean;
}): Promise<Order> {
  const store = await readStore();
  const comment = (input.comment || '').trim();
  const now = new Date().toISOString();
  const items: OrderItemSnapshot[] =
    input.items && input.items.length
      ? input.items.map((item) => ({ ...item, qty: Math.max(1, Math.floor(item.qty || 1)) }))
      : input.product
        ? [{ ...input.product, qty: 1 }]
        : [];
  if (!items.length) {
    throw new Error('Order has no items');
  }
  const first = items[0];
  const total = items.reduce((sum, item) => sum + item.price * item.qty, 0);
  const order: Order = {
    id: createId(),
    createdAt: now,
    phone: input.phone,
    name: (input.name || '').trim() || undefined,
    comment: comment || undefined,
    quantity: items.reduce((sum, item) => sum + item.qty, 0),
    product: {
      id: first.id,
      title: first.title,
      price: first.price,
      code: first.code,
      image: first.image,
    },
    items,
    total,
    fulfillment: input.fulfillment === 'delivery' ? 'delivery' : 'pickup',
    address: input.fulfillment === 'delivery' ? (input.address || '').trim() || undefined : undefined,
    source: 'shop',
    emailed: input.emailed,
    handled: false,
    status: 'new',
    ...(typeof input.telegram === 'boolean' ? { telegram: input.telegram } : {}),
    audit: [{ at: now, action: 'created' }],
  };
  store.orders.unshift(order);
  if (store.orders.length > MAX_ORDERS) {
    store.orders = store.orders.slice(0, MAX_ORDERS);
  }
  await writeStore(store);
  return withNormalizedOrder(order);
}

export type OrderPatch = Partial<
  Pick<Order, 'handled' | 'note' | 'status' | 'callbackAt' | 'outcome' | 'assignee'>
>;

export async function updateOrder(id: string, patch: OrderPatch): Promise<Order | null> {
  const store = await readStore();
  const idx = store.orders.findIndex((o) => o.id === id);
  if (idx < 0) return null;
  const current = withNormalizedOrder(store.orders[idx]);
  const now = new Date().toISOString();
  let audit = current.audit || [];

  let nextStatus = current.status || 'new';
  if (patch.status !== undefined && isWorkflowStatus(patch.status)) {
    nextStatus = patch.status;
  } else if (typeof patch.handled === 'boolean') {
    if (patch.handled) nextStatus = 'done';
    else if (current.status === 'done' || current.status === 'spam') nextStatus = 'new';
  }

  if (nextStatus !== current.status) {
    audit = pushAudit({ ...current, audit }, { at: now, action: 'status', detail: nextStatus });
    if (handledFromStatus(nextStatus) && !handledFromStatus(current.status || 'new')) {
      audit = pushAudit({ ...current, audit }, { at: now, action: 'handled' });
    } else if (!handledFromStatus(nextStatus) && handledFromStatus(current.status || 'new')) {
      audit = pushAudit({ ...current, audit }, { at: now, action: 'reopened' });
    }
  }

  if (patch.note !== undefined && patch.note !== current.note) {
    audit = pushAudit(
      { ...current, audit },
      { at: now, action: 'note', detail: String(patch.note).slice(0, 200) },
    );
  }
  if (patch.callbackAt !== undefined && patch.callbackAt !== current.callbackAt) {
    audit = pushAudit(
      { ...current, audit },
      { at: now, action: 'callback', detail: patch.callbackAt?.slice(0, 40) || 'cleared' },
    );
  }
  if (patch.assignee !== undefined && patch.assignee !== current.assignee) {
    audit = pushAudit(
      { ...current, audit },
      { at: now, action: 'assign', detail: patch.assignee || 'unassigned' },
    );
  }
  const nextOutcome =
    patch.outcome !== undefined && isCloseOutcome(patch.outcome)
      ? patch.outcome
      : current.outcome;
  if (patch.outcome !== undefined && patch.outcome !== current.outcome) {
    audit = pushAudit(
      { ...current, audit },
      { at: now, action: 'outcome', detail: String(patch.outcome || '') },
    );
  }

  const closed = handledFromStatus(nextStatus);
  const next: Order = {
    ...current,
    status: nextStatus,
    handled: closed,
    note: patch.note !== undefined ? patch.note : current.note,
    callbackAt: patch.callbackAt !== undefined ? patch.callbackAt || undefined : current.callbackAt,
    outcome: closed ? nextOutcome : undefined,
    assignee: patch.assignee !== undefined ? patch.assignee || undefined : current.assignee,
    claimedAt:
      patch.assignee !== undefined
        ? patch.assignee
          ? current.claimedAt || now
          : undefined
        : current.claimedAt,
    audit,
    handledAt: closed ? current.handledAt || now : undefined,
  };
  store.orders[idx] = next;
  await writeStore(store);
  return withNormalizedOrder(next);
}

export async function deleteOrder(id: string): Promise<boolean> {
  const store = await readStore();
  const before = store.orders.length;
  store.orders = store.orders.filter((o) => o.id !== id);
  if (store.orders.length === before) return false;
  await writeStore(store);
  return true;
}
