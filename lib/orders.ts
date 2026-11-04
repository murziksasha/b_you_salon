import { promises as fs } from 'fs';
import path from 'path';
import { z } from 'zod';
import { atomicWriteJson } from './atomic-write';
import { withFileMutex } from './file-mutex';
import { createId } from './id';
import { DEFAULT_RETENTION_POLICY, evaluateOrderRetention } from './retention';
import { CONSULT_PRODUCT } from './shop-consult';
import {
  CLOSE_OUTCOMES,
  WORKFLOW_STATUSES,
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
  action: 'created' | 'handled' | 'reopened' | 'note' | 'status' | 'callback' | 'assign' | 'outcome';
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
  source: 'shop' | 'consult';
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

const orderProductSnapshotSchema = z.object({
  id: z.string(),
  title: z.string(),
  price: z.number(),
  code: z.string().optional(),
  image: z.string().optional(),
}).passthrough();

const orderItemSnapshotSchema = z.object({
  id: z.string(),
  title: z.string(),
  price: z.number(),
  code: z.string().optional(),
  image: z.string().optional(),
  qty: z.number(),
}).passthrough();

const orderAuditSchema = z.object({
  at: z.string(),
  action: z.enum(['created', 'handled', 'reopened', 'note', 'emailed', 'status', 'callback', 'assign', 'outcome']),
  detail: z.string().optional(),
}).passthrough();

export const orderSchema = z.object({
  id: z.string().min(1),
  createdAt: z.string().min(1),
  phone: z.string().min(1),
  comment: z.string().optional(),
  name: z.string().optional(),
  quantity: z.number(),
  product: orderProductSnapshotSchema,
  items: z.array(orderItemSnapshotSchema).optional(),
  total: z.number().optional(),
  fulfillment: z.enum(['pickup', 'delivery']).optional(),
  address: z.string().optional(),
  source: z.enum(['shop', 'consult']),
  emailed: z.boolean(),
  handled: z.boolean(),
  status: z.enum(WORKFLOW_STATUSES).optional(),
  note: z.string().optional(),
  outcome: z.enum(CLOSE_OUTCOMES).optional(),
  assignee: z.string().optional(),
  claimedAt: z.string().optional(),
  handledAt: z.string().optional(),
  callbackAt: z.string().optional(),
  audit: z.array(orderAuditSchema).optional(),
  telegram: z.boolean().optional(),
}).passthrough();

export const ordersStoreSchema = z.object({
  orders: z.array(orderSchema),
});

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
    const parsed = JSON.parse(raw);
    const result = ordersStoreSchema.safeParse(parsed);
    if (!result.success) {
      throw new Error(`Corrupted or invalid orders store: ${result.error.message}`);
    }
    return result.data as OrdersStore;
  } catch (err) {
    const code = (err as NodeJS.ErrnoException)?.code;
    if (code === 'ENOENT') return { orders: [] };
    // Transient I/O or parse error — propagate instead of silently returning empty
    console.error('[orders] Failed to read orders.json:', err);
    throw err;
  }
}

async function writeStore(store: OrdersStore): Promise<void> {
  const valid = ordersStoreSchema.parse(store);
  await atomicWriteJson(ordersFilePath(), valid);
}

function withOrdersLock<T>(fn: () => Promise<T>): Promise<T> {
  return withFileMutex(ordersFilePath(), fn);
}

function pushAudit(order: Order, entry: OrderAuditEntry): OrderAuditEntry[] {
  const list = [...(order.audit || []), entry];
  return list.slice(-MAX_AUDIT);
}

export function withNormalizedOrder(order: Order): Order {
  const status = normalizeStatus(order.status, order.handled);
  return {
    ...order,
    status,
    handled: handledFromStatus(status),
  };
}

export async function listOrders(): Promise<Order[]> {
  const store = await readStore();
  return store.orders.map(withNormalizedOrder);
}

export async function countOrders(opts?: { unhandledOnly?: boolean }): Promise<number> {
  const orders = await listOrders();
  if (opts?.unhandledOnly) {
    return orders.filter(o => !handledFromStatus(normalizeStatus(o.status, o.handled))).length;
  }
  return orders.length;
}

export async function appendOrder(input: {
  phone: string;
  name?: string;
  comment?: string;
  product?: OrderProductSnapshot;
  items?: OrderItemSnapshot[];
  fulfillment?: Fulfillment;
  address?: string;
  emailed: boolean;
  telegram?: boolean;
  source?: Order['source'];
}): Promise<Order> {
  return withOrdersLock(async () => {
    const store = await readStore();
    const comment = (input.comment || '').trim();
    const now = new Date().toISOString();
    const consult = input.source === 'consult';
    const items: OrderItemSnapshot[] =
      input.items && input.items.length
        ? input.items.map(item => ({ ...item, qty: Math.max(1, Math.floor(item.qty || 1)) }))
        : input.product
          ? [{ ...input.product, qty: 1 }]
          : consult
            ? [{ ...CONSULT_PRODUCT, qty: 1 }]
            : [];
    if (!items.length) {
      throw new Error('Order has no items');
    }
    const first = items[0]!;
    const total = items.reduce((sum, item) => sum + item.price * item.qty, 0);

    const order: Order = {
      id: createId(),
      createdAt: now,
      phone: input.phone,
      comment: comment || undefined,
      name: (input.name || '').trim() || undefined,
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
      fulfillment: consult ? 'pickup' : input.fulfillment === 'delivery' ? 'delivery' : 'pickup',
      address: !consult && input.fulfillment === 'delivery' ? (input.address || '').trim() || undefined : undefined,
      source: consult ? 'consult' : 'shop',
      emailed: input.emailed,
      handled: false,
      status: 'new',
      ...(typeof input.telegram === 'boolean' ? { telegram: input.telegram } : {}),
      audit: [{ at: now, action: 'created' }],
    };
    store.orders.unshift(order);
    await writeStore(store);
    return withNormalizedOrder(order);
  });
}

export const createOrder = appendOrder;

export type OrderPatch = Partial<Pick<Order, 'handled' | 'note' | 'status' | 'callbackAt' | 'outcome' | 'assignee'>>;

export async function updateOrder(id: string, patch: OrderPatch): Promise<Order | null> {
  return withOrdersLock(async () => {
    const store = await readStore();
    const idx = store.orders.findIndex(o => o.id === id);
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
      audit = pushAudit({ ...current, audit }, { at: now, action: 'note', detail: String(patch.note).slice(0, 200) });
    }
    if (patch.callbackAt !== undefined && patch.callbackAt !== current.callbackAt) {
      audit = pushAudit(
        { ...current, audit },
        { at: now, action: 'callback', detail: patch.callbackAt?.slice(0, 40) || 'cleared' },
      );
    }
    if (patch.assignee !== undefined && patch.assignee !== current.assignee) {
      audit = pushAudit({ ...current, audit }, { at: now, action: 'assign', detail: patch.assignee || 'unassigned' });
    }
    const nextOutcome = patch.outcome !== undefined && isCloseOutcome(patch.outcome) ? patch.outcome : current.outcome;
    if (patch.outcome !== undefined && patch.outcome !== current.outcome) {
      audit = pushAudit({ ...current, audit }, { at: now, action: 'outcome', detail: String(patch.outcome || '') });
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
        patch.assignee !== undefined ? (patch.assignee ? current.claimedAt || now : undefined) : current.claimedAt,
      audit,
      handledAt: closed ? current.handledAt || now : undefined,
    };
    store.orders[idx] = next;
    await writeStore(store);
    return withNormalizedOrder(next);
  });
}

export async function deleteOrder(id: string): Promise<boolean> {
  return withOrdersLock(async () => {
    const store = await readStore();
    const before = store.orders.length;
    store.orders = store.orders.filter(o => o.id !== id);
    if (store.orders.length === before) return false;
    await writeStore(store);
    return true;
  });
}

export interface OrderRetentionPurgeResult {
  purgedCount: number;
  retainedCount: number;
  undatedLegacyCount: number;
}

/**
 * Idempotent retention purge:
 * Deletes orders where status is 'done' or 'spam' AND handledAt is older than 12 months.
 * Retains 'new', 'in_progress', 'no_answer', reopened, and legacy undated items.
 */
export async function purgeExpiredOrders(
  now = Date.now(),
  opts: { ordersPurgeEnabled?: boolean } = {},
): Promise<OrderRetentionPurgeResult> {
  return withOrdersLock(async () => {
    const store = await readStore();
    const refDate = new Date(now);
    const policy = {
      ...DEFAULT_RETENTION_POLICY,
      ordersPurgeEnabled: opts.ordersPurgeEnabled ?? DEFAULT_RETENTION_POLICY.ordersPurgeEnabled,
    };
    let undatedLegacyCount = 0;
    const initialCount = store.orders.length;

    const remaining = store.orders.filter((order) => {
      const evaluation = evaluateOrderRetention(order, refDate, policy);
      if (evaluation.reason === 'missing_handled_at') {
        undatedLegacyCount++;
      }
      return !evaluation.purgeable;
    });

    const purgedCount = initialCount - remaining.length;
    if (purgedCount > 0) {
      store.orders = remaining;
      await writeStore(store);
    }

    if (undatedLegacyCount > 0) {
      console.warn(`[orders retention] Retained ${undatedLegacyCount} closed orders missing handledAt for review`);
    }

    return { purgedCount, retainedCount: remaining.length, undatedLegacyCount };
  });
}
