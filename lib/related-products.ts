import type { Product } from './types';

/** Related products: explicit relatedIds first, then same category, then others. */
export function getRelatedProducts(
  products: Product[],
  current: Product,
  limit = 4,
): Product[] {
  const byId = new Map(products.map((p) => [p.id, p]));
  const out: Product[] = [];
  const seen = new Set<string>([current.id]);

  for (const id of current.relatedIds || []) {
    const p = byId.get(id);
    if (p?.visible && !seen.has(p.id)) {
      out.push(p);
      seen.add(p.id);
    }
    if (out.length >= limit) return out;
  }

  const others = products.filter((p) => p.visible && !seen.has(p.id));
  const cat = (current.category || '').trim().toLowerCase();
  const same = cat
    ? others.filter((p) => (p.category || '').trim().toLowerCase() === cat)
    : [];
  const rest = others.filter((p) => !same.includes(p));
  for (const p of [...same, ...rest]) {
    out.push(p);
    if (out.length >= limit) break;
  }
  return out;
}
