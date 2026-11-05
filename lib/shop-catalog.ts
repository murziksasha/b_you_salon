import type { Product } from './types';

export type ProductSort = 'manual' | 'price-asc' | 'price-desc' | 'title-asc' | 'title-desc';

export type VisibilityFilter = 'all' | 'visible' | 'hidden';

export const PRODUCT_SORT_OPTIONS: { value: ProductSort; label: string }[] = [
  { value: 'manual', label: 'За порядком' },
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
 * Empty categories (if any) are inserted immediately before the default «Інше» group.
 * Default «Інше» bucket (if any) is always last.
 */
export function groupProductsByCategory<T extends Product>(
  products: T[],
  opts: { localeSortCategories?: boolean; emptyCategories?: string[] } = {},
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

  if (opts.emptyCategories?.length) {
    const existingKeys = new Set(keys);
    const emptyKeysToAdd = opts.emptyCategories
      .filter((c) => c && c !== UNCATEGORIZED_KEY && c !== DEFAULT_CATEGORY && !existingKeys.has(c))
      .sort((a, b) => a.localeCompare(b, 'uk'));
    keys = [...keys, ...emptyKeysToAdd];
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
 * Case-fold a category name for comparisons using Ukrainian locale.
 */
export function foldCategoryName(name: string): string {
  return name.trim().toLocaleLowerCase('uk');
}

export type CategoryValidationResult =
  | { valid: true; name: string; error?: never }
  | { valid: false; error: string; name?: never };

/**
 * Validate category name against rules:
 * - not blank
 * - max 120 chars
 * - not reserved («Інше», «Усі»)
 * - not a case-insensitive duplicate of an existing category (ignoring `opts.ignore` when renaming)
 */
export function validateCategoryName(
  raw: string | undefined | null,
  existing: string[] = [],
  opts: { ignore?: string } = {},
): CategoryValidationResult {
  const trimmed = (raw || '').trim();
  if (!trimmed) {
    return { valid: false, error: 'Назва категорії не може бути порожньою' };
  }
  if (trimmed.length > 120) {
    return { valid: false, error: 'Назва категорії не може перевищувати 120 символів' };
  }
  const folded = foldCategoryName(trimmed);
  if (folded === foldCategoryName(DEFAULT_CATEGORY)) {
    return { valid: false, error: '«Інше» — зарезервована назва' };
  }
  if (folded === foldCategoryName('Усі')) {
    return { valid: false, error: '«Усі» — зарезервована назва' };
  }

  const ignoreTrim = opts.ignore?.trim();
  const isDuplicate = existing.some((cat) => {
    const catTrim = cat.trim();
    if (!catTrim) return false;
    if (ignoreTrim && catTrim === ignoreTrim) return false;
    return foldCategoryName(catTrim) === folded;
  });

  if (isDuplicate) {
    return { valid: false, error: 'Категорія з такою назвою вже існує' };
  }

  return { valid: true, name: trimmed };
}

/**
 * Union stored categories with categories currently on products.
 * Drops blanks and reserved names («Інше», «Усі»). Sorts by Ukrainian locale.
 * Preserves pre-existing chips that differ only by case as separate chips.
 */
export function mergeCategoryNames(
  stored: string[] | undefined | null,
  products: Product[],
): string[] {
  const seen = new Set<string>();

  for (const item of stored || []) {
    const trimmed = (item || '').trim();
    if (!trimmed) continue;
    const folded = foldCategoryName(trimmed);
    if (folded === foldCategoryName(DEFAULT_CATEGORY) || folded === foldCategoryName('Усі')) {
      continue;
    }
    seen.add(trimmed);
  }

  for (const p of products) {
    if (isDefaultCategory(p)) continue;
    const cat = (p.category || '').trim();
    if (!cat) continue;
    const folded = foldCategoryName(cat);
    if (folded === foldCategoryName(DEFAULT_CATEGORY) || folded === foldCategoryName('Усі')) {
      continue;
    }
    seen.add(cat);
  }

  return Array.from(seen).sort((a, b) => a.localeCompare(b, 'uk'));
}

/**
 * Delete a named category:
 * - products matching `name` (exact) are moved to DEFAULT_CATEGORY.
 * - `name` is removed from `categories`.
 */
export function deleteNamedCategory<T extends Product>(
  goods: T[],
  categories: string[],
  name: string,
): {
  goods: T[];
  categories: string[];
  movedCount: number;
} {
  const nameTrim = name.trim();
  const movedCount = goods.filter((g) => (g.category || '').trim() === nameTrim).length;
  const nextGoods = renameCategoryInGoods(goods, nameTrim, DEFAULT_CATEGORY);
  const nextCategories = categories.filter((c) => c !== nameTrim);

  return {
    goods: nextGoods,
    categories: nextCategories,
    movedCount,
  };
}

export type RenameCategoryResult<T extends Product = Product> = {
  success: boolean;
  error?: string;
  goods: T[];
  categories: string[];
  targetName: string;
};

/**
 * Rename a stored category:
 * - refuses blank, reserved names («Інше», «Усі»), and > 120 chars.
 * - case-only change: updates stored spelling and product strings.
 * - fold-match to a different existing chip: merges goods into that chip's spelling and drops `from`.
 * - new name: updates stored spelling and product strings.
 */
export function renameStoredCategory<T extends Product>(
  goods: T[],
  categories: string[],
  from: string,
  to: string,
): RenameCategoryResult<T> {
  const fromTrim = from.trim();
  const toTrim = to.trim();

  const fromFold = foldCategoryName(fromTrim);
  if (!fromTrim || fromFold === foldCategoryName(DEFAULT_CATEGORY) || fromFold === foldCategoryName('Усі')) {
    return {
      success: false,
      error: 'Неможливо перейменувати зарезервовану категорію',
      goods,
      categories,
      targetName: fromTrim,
    };
  }

  if (!toTrim) {
    return {
      success: false,
      error: 'Назва категорії не може бути порожньою',
      goods,
      categories,
      targetName: fromTrim,
    };
  }
  if (toTrim.length > 120) {
    return {
      success: false,
      error: 'Назва категорії не може перевищувати 120 символів',
      goods,
      categories,
      targetName: fromTrim,
    };
  }

  const toFold = foldCategoryName(toTrim);
  if (toFold === foldCategoryName(DEFAULT_CATEGORY)) {
    return {
      success: false,
      error: '«Інше» — зарезервована назва',
      goods,
      categories,
      targetName: fromTrim,
    };
  }
  if (toFold === foldCategoryName('Усі')) {
    return {
      success: false,
      error: '«Усі» — зарезервована назва',
      goods,
      categories,
      targetName: fromTrim,
    };
  }

  if (fromTrim === toTrim) {
    return {
      success: true,
      goods,
      categories,
      targetName: toTrim,
    };
  }

  // Check if `to` matches an existing different category (merge)
  const existingOther = categories.find(
    (c) => c !== fromTrim && foldCategoryName(c) === toFold,
  );

  if (existingOther) {
    // Merge into existing other category
    const nextGoods = renameCategoryInGoods(goods, fromTrim, existingOther);
    const nextCategories = categories.filter((c) => c !== fromTrim);
    return {
      success: true,
      goods: nextGoods,
      categories: nextCategories,
      targetName: existingOther,
    };
  }

  // Check if case-only change of same category
  if (fromFold === toFold) {
    const nextGoods = goods.map((g) => {
      const cat = (g.category || '').trim();
      if (cat === fromTrim) {
        return { ...g, category: toTrim };
      }
      return g;
    });
    const nextCategories = categories.map((c) => (c === fromTrim ? toTrim : c));
    return {
      success: true,
      goods: nextGoods,
      categories: nextCategories,
      targetName: toTrim,
    };
  }

  // Brand-new category name
  const nextGoods = renameCategoryInGoods(goods, fromTrim, toTrim);
  const nextCategories = categories
    .map((c) => (c === fromTrim ? toTrim : c))
    .sort((a, b) => a.localeCompare(b, 'uk'));

  return {
    success: true,
    goods: nextGoods,
    categories: nextCategories,
    targetName: toTrim,
  };
}

/**
 * Append a valid new category name, or return the canonical spelling of a fold-match.
 */
export function upsertCategoryName(
  categories: string[],
  name: string,
): {
  categories: string[];
  canonical: string;
  isNew: boolean;
} {
  const trimmed = name.trim();
  const fold = foldCategoryName(trimmed);
  const match = categories.find((c) => foldCategoryName(c) === fold);

  if (match) {
    return {
      categories,
      canonical: match,
      isNew: false,
    };
  }

  const next = [...categories, trimmed].sort((a, b) => a.localeCompare(b, 'uk'));
  return {
    categories: next,
    canonical: trimmed,
    isNew: true,
  };
}

/**
 * Return stored category names that currently have zero products.
 */
export function emptyCategoryGroups(categories: string[], products: Product[]): string[] {
  const activeSet = new Set<string>();
  for (const p of products) {
    if (isDefaultCategory(p)) continue;
    const cat = (p.category || '').trim();
    if (cat) activeSet.add(cat);
  }

  return categories
    .filter((c) => {
      const trimmed = c.trim();
      return trimmed && !activeSet.has(trimmed);
    })
    .sort((a, b) => a.localeCompare(b, 'uk'));
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

export type GroupCheckState = 'none' | 'some' | 'all';

/**
 * Determine selection tri-state for products listed in a group.
 */
export function getGroupCheckState(
  groupIds: string[],
  selected: Record<string, boolean>,
): GroupCheckState {
  if (groupIds.length === 0) return 'none';
  let checkedCount = 0;
  for (const id of groupIds) {
    if (selected[id]) checkedCount++;
  }
  if (checkedCount === 0) return 'none';
  if (checkedCount === groupIds.length) return 'all';
  return 'some';
}

/**
 * Toggle selection of a group's products.
 * If all are checked: uncheck only those IDs (keep all other selected IDs).
 * If not all are checked: check all those IDs (keep all other selected IDs).
 */
export function toggleGroupSelection(
  currentSelected: Record<string, boolean>,
  groupIds: string[],
): Record<string, boolean> {
  if (groupIds.length === 0) return { ...currentSelected };
  const allChecked = groupIds.every((id) => Boolean(currentSelected[id]));
  const next: Record<string, boolean> = { ...currentSelected };
  if (allChecked) {
    for (const id of groupIds) {
      delete next[id];
    }
  } else {
    for (const id of groupIds) {
      next[id] = true;
    }
  }
  return next;
}

/**
 * Move checked products to target category.
 * «Інше» stores `undefined`. Products already in target category are skipped.
 * Does not reorder catalog array or touch `goodsCategories`.
 */
export function moveGoodsCategory<T extends Product>(
  goods: T[],
  selectedIds: string[] | Set<string>,
  targetCategory: string,
): {
  goods: T[];
  changedCount: number;
  alreadyInTargetCount: number;
} {
  const set = selectedIds instanceof Set ? selectedIds : new Set(selectedIds);
  const targetNorm = normalizeCategoryInput(targetCategory);
  let changedCount = 0;
  let alreadyInTargetCount = 0;

  const nextGoods = goods.map((p) => {
    if (!set.has(p.id)) return p;
    const isAlready =
      targetNorm === undefined ? isDefaultCategory(p) : (p.category || '').trim() === targetNorm;
    if (isAlready) {
      alreadyInTargetCount++;
      return p;
    }
    changedCount++;
    return { ...p, category: targetNorm };
  });

  return { goods: nextGoods, changedCount, alreadyInTargetCount };
}

/**
 * Set visibility for checked products.
 * Products already in target visibility state are skipped.
 */
export function setGoodsVisibility<T extends Product>(
  goods: T[],
  selectedIds: string[] | Set<string>,
  visible: boolean,
): {
  goods: T[];
  changedCount: number;
  alreadyInTargetCount: number;
} {
  const set = selectedIds instanceof Set ? selectedIds : new Set(selectedIds);
  let changedCount = 0;
  let alreadyInTargetCount = 0;

  const nextGoods = goods.map((p) => {
    if (!set.has(p.id)) return p;
    if (p.visible === visible) {
      alreadyInTargetCount++;
      return p;
    }
    changedCount++;
    return { ...p, visible };
  });

  return { goods: nextGoods, changedCount, alreadyInTargetCount };
}

/**
 * Confirm dialog text in Ukrainian matching existing catalog style.
 * Returns null when changedCount is 0.
 */
export function formatBulkConfirmMessage(opts: {
  action: 'show' | 'hide' | 'move';
  targetCategoryLabel?: string;
  changedCount: number;
  alreadyInTargetCount: number;
  dirty?: boolean;
}): string | null {
  const { action, targetCategoryLabel, changedCount, alreadyInTargetCount, dirty } = opts;
  if (changedCount <= 0) return null;

  let question = '';
  if (action === 'show') {
    question = `Показати ${changedCount} товар(ів)?`;
  } else if (action === 'hide') {
    question = `Приховати ${changedCount} товар(ів)?`;
  } else if (action === 'move') {
    const label = targetCategoryLabel?.trim() || DEFAULT_CATEGORY;
    question = `Перенести ${changedCount} товар(ів) у «${label}»?`;
  }

  const parts: string[] = [question];

  if (alreadyInTargetCount > 0) {
    if (action === 'show') {
      parts.push(`${alreadyInTargetCount} вже показано.`);
    } else if (action === 'hide') {
      parts.push(`${alreadyInTargetCount} вже приховано.`);
    } else if (action === 'move') {
      parts.push(`${alreadyInTargetCount} вже в цій групі.`);
    }
  }

  if (dirty) {
    parts.push('Інші незбережені зміни товарів теж буде збережено.');
  }

  return parts.join('\n\n');
}

