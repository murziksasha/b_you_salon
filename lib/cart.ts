import type { Product } from './types';

export const CART_STORAGE_KEY = 'byou-cart';
export const MAX_QTY = 99;
export const MAX_LINES = 30;

export type CartLine = { id: string; qty: number };

export type HydratedCartLine = {
  id: string;
  qty: number;
  product?: Product;
  available: boolean;
  reason?: 'missing' | 'hidden' | 'oos';
};

export function clampQty(n: number): number {
  if (!Number.isFinite(n)) return 1;
  return Math.max(1, Math.min(MAX_QTY, Math.floor(n)));
}

export function parseCartLines(raw: unknown): CartLine[] {
  if (!Array.isArray(raw)) return [];
  const out: CartLine[] = [];
  const seen = new Set<string>();
  for (const row of raw) {
    if (!row || typeof row !== 'object') continue;
    const rec = row as Record<string, unknown>;
    const id = typeof rec.id === 'string' ? rec.id.trim() : '';
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push({ id, qty: clampQty(Number(rec.qty)) });
    if (out.length >= MAX_LINES) break;
  }
  return out;
}

export function mergeLine(lines: CartLine[], id: string, qty: number): CartLine[] {
  const nextQty = clampQty(qty);
  const idx = lines.findIndex((l) => l.id === id);
  if (idx < 0) {
    if (lines.length >= MAX_LINES) return lines;
    return [...lines, { id, qty: nextQty }];
  }
  const next = [...lines];
  next[idx] = { id, qty: nextQty };
  return next;
}

export function addLine(lines: CartLine[], id: string, qty = 1): CartLine[] {
  const existing = lines.find((l) => l.id === id);
  const nextQty = clampQty((existing?.qty || 0) + qty);
  return mergeLine(lines, id, nextQty);
}

export function removeLine(lines: CartLine[], id: string): CartLine[] {
  return lines.filter((l) => l.id !== id);
}

export function cartCount(lines: CartLine[]): number {
  return lines.reduce((sum, l) => sum + l.qty, 0);
}

export function hydrateCart(lines: CartLine[], products: Product[]): HydratedCartLine[] {
  const byId = new Map(products.map((p) => [p.id, p]));
  return lines.map((line) => {
    const product = byId.get(line.id);
    if (!product) return { ...line, available: false, reason: 'missing' as const };
    if (!product.visible) return { ...line, product, available: false, reason: 'hidden' as const };
    if (product.inStock === false) return { ...line, product, available: false, reason: 'oos' as const };
    return { ...line, product, available: true };
  });
}

export function availableCartItems(hydrated: HydratedCartLine[]): Array<{
  id: string;
  title: string;
  price: number;
  qty: number;
  code?: string;
  image?: string;
}> {
  return hydrated
    .filter((row) => row.available && row.product)
    .map((row) => ({
      id: row.product!.id,
      title: row.product!.title,
      price: row.product!.price,
      qty: row.qty,
      code: row.product!.code,
      image: row.product!.image,
    }));
}

export function cartTotal(items: Array<{ price: number; qty: number }>): number {
  return items.reduce((sum, i) => sum + i.price * i.qty, 0);
}
