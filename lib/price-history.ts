import { promises as fs } from 'fs';
import path from 'path';
import { atomicWriteJson } from './atomic-write';

export type PricePoint = {
  at: string;
  productId: string;
  price: number;
  title?: string;
};

type Store = { entries: PricePoint[] };

const MAX = 2000;

function dataRoot(): string {
  return process.env.DATA_DIR || path.join(process.cwd(), 'data');
}

export function priceHistoryPath(): string {
  return path.join(dataRoot(), 'price-history.json');
}

async function readStore(): Promise<Store> {
  try {
    const raw = await fs.readFile(priceHistoryPath(), 'utf-8');
    const parsed = JSON.parse(raw) as Store;
    if (!parsed || !Array.isArray(parsed.entries)) return { entries: [] };
    return parsed;
  } catch {
    return { entries: [] };
  }
}

async function writeStore(store: Store): Promise<void> {
  await atomicWriteJson(priceHistoryPath(), store);
}

export async function recordPriceChange(input: {
  productId: string;
  price: number;
  title?: string;
  prevPrice?: number;
}): Promise<void> {
  if (typeof input.prevPrice === 'number' && input.prevPrice === input.price) return;
  const store = await readStore();
  store.entries.unshift({
    at: new Date().toISOString(),
    productId: input.productId,
    price: input.price,
    title: input.title,
  });
  if (store.entries.length > MAX) store.entries = store.entries.slice(0, MAX);
  await writeStore(store);
}

export async function listPriceHistory(productId?: string, limit = 50): Promise<PricePoint[]> {
  const store = await readStore();
  let list = store.entries;
  if (productId) list = list.filter((e) => e.productId === productId);
  return list.slice(0, Math.max(1, Math.min(limit, 200)));
}
