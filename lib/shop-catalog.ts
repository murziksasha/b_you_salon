import type { Product } from './types';

export type ProductSort = 'manual' | 'price-asc' | 'price-desc' | 'title-asc' | 'title-desc';

export type VisibilityFilter = 'all' | 'visible' | 'hidden';

export const PRODUCT_SORT_OPTIONS: { value: ProductSort; label: string }[] = [
  { value: 'manual', label: 'За порядком каталогу' },
  { value: 'price-asc', label: 'Ціна: від дешевих' },
  { value: 'price-desc', label: 'Ціна: від дорогих' },
  { value: 'title-asc', label: 'Назва: А → Я' },
  { value: 'title-desc', label: 'Назва: Я → А' },
];

export function normalizeQuery(q: string): string {
  return q.trim().toLowerCase();
}

export function matchesProductQuery(product: Product, q: string): boolean {
  const normalized = normalizeQuery(q);
  if (!normalized) return true;
  const title = product.title.toLowerCase();
  const description = product.description.toLowerCase();
  const category = displayCategory(product).toLowerCase();
  const code = (product.code || '').toLowerCase();
  return (
    title.includes(normalized) ||
    description.includes(normalized) ||
    category.includes(normalized) ||
    code.includes(normalized)
  );
}

export function matchesVisibility(product: Product, visibility: VisibilityFilter = 'all'): boolean {
  if (visibility === 'visible') return product.visible;
  if (visibility === 'hidden') return !product.visible;
  return true;
}

/**
 * Default category when none is set on a product.
 * Stored as empty/`undefined` on Product; display + filters use this label.
 */
export const DEFAULT_CATEGORY = 'Інше';

/** @deprecated Use DEFAULT_CATEGORY — kept as alias for older call sites. */
export const UNCATEGORIZED_LABEL = DEFAULT_CATEGORY;

/**
 * Internal group/filter key for products without a specific category.
 * Prefer filtering by `DEFAULT_CATEGORY` in UI; this sentinel still matches.
 */
export const UNCATEGORIZED_KEY = '__none__';

/** True when product has no specific category (empty or explicit «Інше»). */
export function isDefaultCategory(product: Product): boolean {
  const cat = (product.category || '').trim();
  return !cat || cat === DEFAULT_CATEGORY;
}

/** True for filter values that mean the default «Інше» bucket. */
export function isDefaultCategoryFilter(value: string | undefined | null): boolean {
  const cat = (value || '').trim();
  return cat === UNCATEGORIZED_KEY || cat === DEFAULT_CATEGORY;
}

/** Display label for a product's category (always non-empty). */
export function displayCategory(product: Product): string {
  const cat = (product.category || '').trim();
  if (!cat || cat === DEFAULT_CATEGORY) return DEFAULT_CATEGORY;
  return cat;
}

/** Normalize free-text category for storage: empty / «Інше» → undefined. */
export function normalizeCategoryInput(value: string | undefined | null): string | undefined {
  const cat = (value || '').trim();
  if (!cat || cat === DEFAULT_CATEGORY) return undefined;
  return cat;
}

export function productCategoryKey(product: Product): string {
  return isDefaultCategory(product) ? UNCATEGORIZED_KEY : (product.category || '').trim();
}

export function matchesCategory(product: Product, category?: string): boolean {
  const cat = category?.trim();
  if (!cat) return true;
  if (isDefaultCategoryFilter(cat)) return isDefaultCategory(product);
  return (product.category || '').trim() === cat;
}

export type ProductCategoryGroup<T extends Product = Product> = {
  /** Category name, or `UNCATEGORIZED_KEY` for default «Інше». */
  key: string;
  /** Display label (always «Інше» for the default bucket). */
  label: string;
  products: T[];
  total: number;
  visibleCount: number;
};

/**
 * Group products by category in **first-seen** catalog order.
 * Default «Інше» bucket (if any) is always last.
 */
export function groupProductsByCategory<T extends Product>(
  products: T[],
  opts: { localeSortCategories?: boolean } = {},
): ProductCategoryGroup<T>[] {
  const map = new Map<string, T[]>();
  const order: string[] = [];

  for (const p of products) {
    const key = productCategoryKey(p);
    if (!map.has(key)) {
      map.set(key, []);
      order.push(key);
    }
    map.get(key)!.push(p);
  }

  let keys = order.filter((k) => k !== UNCATEGORIZED_KEY);
  if (opts.localeSortCategories) {
    keys = [...keys].sort((a, b) => a.localeCompare(b, 'uk'));
  }
  if (map.has(UNCATEGORIZED_KEY)) keys.push(UNCATEGORIZED_KEY);

  return keys.map((key) => {
    const list = map.get(key) || [];
    return {
      key,
      label: key === UNCATEGORIZED_KEY ? DEFAULT_CATEGORY : key,
      products: list,
      total: list.length,
      visibleCount: list.filter((x) => x.visible).length,
    };
  });
}

/**
 * Rename a category string across goods.
 * - `from` may be a named category or the default bucket (empty / «Інше» / sentinel).
 * - empty `to` or «Інше» → clear to default (uncategorized).
 */
export function renameCategoryInGoods<T extends Product>(goods: T[], from: string, to: string): T[] {
  const fromTrim = from.trim();
  const toNorm = normalizeCategoryInput(to);
  if (!fromTrim) return goods;

  const fromIsDefault = isDefaultCategoryFilter(fromTrim);
  // Same name no-op (including default → default)
  if (fromIsDefault && toNorm === undefined) return goods;
  if (!fromIsDefault && fromTrim === (toNorm || '')) return goods;

  return goods.map((g) => {
    const cat = (g.category || '').trim();
    const matches = fromIsDefault
      ? isDefaultCategory(g)
      : cat === fromTrim || (fromTrim === DEFAULT_CATEGORY && isDefaultCategory(g));
    if (!matches) return g;
    return { ...g, category: toNorm };
  });
}

/** Pinned products first (sortPin), preserving relative order within each group. */
export function applySortPin<T extends Product>(items: T[]): T[] {
  if (items.length < 2) return items;
  const pinned: T[] = [];
  const rest: T[] = [];
  for (const p of items) {
    if (p.sortPin) pinned.push(p);
    else rest.push(p);
  }
  if (!pinned.length) return items;
  return [...pinned, ...rest];
}

export function sortProducts<T extends Product>(items: T[], sort: ProductSort = 'manual'): T[] {
  if (items.length < 2) return items;

  if (sort === 'manual') {
    return applySortPin(items);
  }

  const next = [...items];
  next.sort((a, b) => {
    // Pinned always float to top for any sort
    if (Boolean(a.sortPin) !== Boolean(b.sortPin)) {
      return a.sortPin ? -1 : 1;
    }
    switch (sort) {
      case 'price-asc':
        return a.price - b.price || a.title.localeCompare(b.title, 'uk');
      case 'price-desc':
        return b.price - a.price || a.title.localeCompare(b.title, 'uk');
      case 'title-asc':
        return a.title.localeCompare(b.title, 'uk');
      case 'title-desc':
        return b.title.localeCompare(a.title, 'uk');
      default:
        return 0;
    }
  });
  return next;
}

export function filterAndSortProducts(
  products: Product[],
  opts: {
    query?: string;
    sort?: ProductSort;
    visibility?: VisibilityFilter;
    category?: string;
  } = {},
): Product[] {
  const { query = '', sort = 'manual', visibility = 'all', category } = opts;
  const filtered = products.filter(
    (p) => matchesVisibility(p, visibility) && matchesCategory(p, category) && matchesProductQuery(p, query),
  );
  return sortProducts(filtered, sort);
}

export function parseProductSort(value: string | null | undefined): ProductSort {
  switch (value) {
    case 'price-asc':
    case 'price-desc':
    case 'title-asc':
    case 'title-desc':
    case 'manual':
      return value;
    default:
      return 'manual';
  }
}

/**
 * Unique category labels for filters/chips.
 * Specific categories first (uk locale), then «Інше» last when any product lacks a specific category.
 * Set `includeDefault: false` to list only explicit named categories.
 */
export function collectCategories(
  products: Product[],
  opts: { includeDefault?: boolean } = {},
): string[] {
  const includeDefault = opts.includeDefault !== false;
  const seen = new Set<string>();
  const list: string[] = [];
  let hasDefault = false;

  for (const p of products) {
    if (isDefaultCategory(p)) {
      hasDefault = true;
      continue;
    }
    const cat = (p.category || '').trim();
    if (!cat || seen.has(cat)) continue;
    seen.add(cat);
    list.push(cat);
  }

  list.sort((a, b) => a.localeCompare(b, 'uk'));
  if (includeDefault && hasDefault) list.push(DEFAULT_CATEGORY);
  return list;
}

export function hasActiveCatalogParams(opts: {
  query?: string;
  sort?: ProductSort;
  category?: string;
}): boolean {
  const q = normalizeQuery(opts.query || '');
  const sort = opts.sort || 'manual';
  const category = (opts.category || '').trim();
  return Boolean(q) || sort !== 'manual' || Boolean(category);
}
