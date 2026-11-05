import { describe, expect, it } from 'vitest';
import type { Product } from './types';
import {
  DEFAULT_CATEGORY,
  UNCATEGORIZED_KEY,
  UNCATEGORIZED_LABEL,
  collectCategories,
  deleteNamedCategory,
  displayCategory,
  emptyCategoryGroups,
  filterAndSortProducts,
  foldCategoryName,
  formatBulkConfirmMessage,
  getGroupCheckState,
  groupProductsByCategory,
  hasActiveCatalogParams,
  isDefaultCategory,
  matchesProductQuery,
  mergeCategoryNames,
  moveGoodsCategory,
  normalizeCategoryInput,
  normalizeQuery,
  parseProductSort,
  productCategoryKey,
  renameCategoryInGoods,
  renameStoredCategory,
  setGoodsVisibility,
  sortProducts,
  toggleGroupSelection,
  upsertCategoryName,
  validateCategoryName,
} from './shop-catalog';

function p(partial: Partial<Product> & Pick<Product, 'id' | 'title' | 'price'>): Product {
  return {
    description: '',
    image: '/x.png',
    visible: true,
    ...partial,
  };
}

const sample: Product[] = [
  p({ id: '1', title: 'Екран iPhone', price: 1200, description: 'Оригінал', category: 'Телефони', code: 'IP-SCR#01' }),
  p({ id: '2', title: 'Блок живлення', price: 350, description: 'TV / монітор', category: 'ТВ', visible: false }),
  p({ id: '3', title: 'Акумулятор', price: 800, description: 'для телефону', category: 'Телефони', code: 'АКБ-12' }),
  p({ id: '4', title: 'Клавіатура', price: 350, description: 'USB', category: 'Ноутбуки', code: 'sku/орг#1' }),
];

describe('normalizeQuery', () => {
  it('trims and lowercases', () => {
    expect(normalizeQuery('  Тест  ')).toBe('тест');
  });
});

describe('matchesProductQuery', () => {
  it('matches title, description, category', () => {
    expect(matchesProductQuery(sample[0], 'iphone')).toBe(true);
    expect(matchesProductQuery(sample[0], 'Ориг')).toBe(true);
    expect(matchesProductQuery(sample[0], 'телефон')).toBe(true);
    expect(matchesProductQuery(sample[0], 'xyz')).toBe(false);
  });

  it('matches product code (case-insensitive, symbols, unicode)', () => {
    expect(matchesProductQuery(sample[0], 'ip-scr')).toBe(true);
    expect(matchesProductQuery(sample[0], 'SCR#01')).toBe(true);
    expect(matchesProductQuery(sample[2], 'акб')).toBe(true);
    expect(matchesProductQuery(sample[3], 'орг#')).toBe(true);
    expect(matchesProductQuery(sample[3], 'sku/')).toBe(true);
    expect(matchesProductQuery(sample[1], 'ip-scr')).toBe(false);
  });

  it('matches default category label «Інше» for uncategorized products', () => {
    const u = p({ id: 'u', title: 'X', price: 1 });
    expect(matchesProductQuery(u, 'інше')).toBe(true);
  });

  it('empty or missing code does not break search', () => {
    expect(matchesProductQuery(sample[1], 'блок')).toBe(true);
    expect(matchesProductQuery(p({ id: 'x', title: 'X', price: 1, code: '' }), 'x')).toBe(true);
  });

  it('empty query matches all', () => {
    expect(matchesProductQuery(sample[0], '  ')).toBe(true);
  });
});

describe('sortProducts', () => {
  it('keeps manual order', () => {
    expect(sortProducts(sample, 'manual').map((x) => x.id)).toEqual(['1', '2', '3', '4']);
  });

  it('sorts by price asc/desc with title tie-break', () => {
    const asc = sortProducts(sample, 'price-asc').map((x) => x.id);
    expect(asc[0]).toBe('2'); // 350 Блок
    expect(asc[1]).toBe('4'); // 350 Клавіатура (locale after Блок)
    expect(sortProducts(sample, 'price-desc')[0].price).toBe(1200);
  });

  it('sorts by title', () => {
    const titles = sortProducts(sample, 'title-asc').map((x) => x.title);
    expect(titles).toEqual([...titles].sort((a, b) => a.localeCompare(b, 'uk')));
  });
});

describe('filterAndSortProducts', () => {
  it('filters by visibility', () => {
    expect(filterAndSortProducts(sample, { visibility: 'hidden' })).toHaveLength(1);
    expect(filterAndSortProducts(sample, { visibility: 'visible' })).toHaveLength(3);
  });

  it('filters by category and query, then sorts', () => {
    const result = filterAndSortProducts(sample, {
      category: 'Телефони',
      query: 'акуму',
      sort: 'price-asc',
    });
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('3');
  });

  it('returns empty for no matches', () => {
    expect(filterAndSortProducts(sample, { query: 'немаєтакого' })).toEqual([]);
  });
});

describe('parseProductSort', () => {
  it('parses known values and defaults', () => {
    expect(parseProductSort('price-asc')).toBe('price-asc');
    expect(parseProductSort('nope')).toBe('manual');
    expect(parseProductSort(null)).toBe('manual');
  });
});

describe('collectCategories', () => {
  it('returns unique sorted named categories', () => {
    expect(collectCategories(sample, { includeDefault: false })).toEqual([
      'Ноутбуки',
      'ТВ',
      'Телефони',
    ]);
  });

  it('appends «Інше» last when uncategorized products exist', () => {
    const withNone = [...sample, p({ id: '5', title: 'Тест', price: 1 })];
    expect(collectCategories(withNone)).toEqual(['Ноутбуки', 'ТВ', 'Телефони', DEFAULT_CATEGORY]);
  });

  it('treats explicit «Інше» as default bucket', () => {
    const list = [p({ id: '1', title: 'A', price: 1, category: DEFAULT_CATEGORY })];
    expect(collectCategories(list)).toEqual([DEFAULT_CATEGORY]);
  });
});

describe('hasActiveCatalogParams', () => {
  it('detects active filters', () => {
    expect(hasActiveCatalogParams({})).toBe(false);
    expect(hasActiveCatalogParams({ sort: 'manual' })).toBe(false);
    expect(hasActiveCatalogParams({ query: 'x' })).toBe(true);
    expect(hasActiveCatalogParams({ sort: 'price-asc' })).toBe(true);
    expect(hasActiveCatalogParams({ category: 'ТВ' })).toBe(true);
  });
});

describe('groupProductsByCategory', () => {
  it('groups in first-seen order and puts «Інше» last', () => {
    const withNone = [
      ...sample,
      p({ id: '5', title: 'Тест', price: 1, category: '' }),
      p({ id: '6', title: 'Ще', price: 2 }),
      p({ id: '7', title: 'Explicit', price: 3, category: DEFAULT_CATEGORY }),
    ];
    const groups = groupProductsByCategory(withNone);
    expect(groups.map((g) => g.key)).toEqual(['Телефони', 'ТВ', 'Ноутбуки', UNCATEGORIZED_KEY]);
    expect(groups[0].products.map((x) => x.id)).toEqual(['1', '3']);
    expect(groups[groups.length - 1].label).toBe(DEFAULT_CATEGORY);
    expect(groups[groups.length - 1].total).toBe(3);
  });

  it('counts visible per group', () => {
    const groups = groupProductsByCategory(sample);
    const tv = groups.find((g) => g.key === 'ТВ');
    expect(tv?.total).toBe(1);
    expect(tv?.visibleCount).toBe(0);
  });

  it('localeSortCategories sorts named groups alphabetically', () => {
    const groups = groupProductsByCategory(sample, { localeSortCategories: true });
    expect(groups.map((g) => g.key)).toEqual(['Ноутбуки', 'ТВ', 'Телефони']);
  });
});

describe('renameCategoryInGoods', () => {
  it('renames matching category; empty to clears field', () => {
    const next = renameCategoryInGoods(sample, 'Телефони', 'Смартфони');
    expect(next.filter((x) => x.category === 'Смартфони')).toHaveLength(2);
    expect(next.find((x) => x.id === '2')?.category).toBe('ТВ');
    const cleared = renameCategoryInGoods(sample, 'ТВ', '  ');
    expect(cleared.find((x) => x.id === '2')?.category).toBeUndefined();
  });

  it('renaming to «Інше» clears category field', () => {
    const next = renameCategoryInGoods(sample, 'ТВ', DEFAULT_CATEGORY);
    expect(next.find((x) => x.id === '2')?.category).toBeUndefined();
  });

  it('renames default bucket products', () => {
    const list = [...sample, p({ id: 'u', title: 'U', price: 1 })];
    const next = renameCategoryInGoods(list, DEFAULT_CATEGORY, 'Різне');
    expect(next.find((x) => x.id === 'u')?.category).toBe('Різне');
  });

  it('no-op on empty from or same name', () => {
    expect(renameCategoryInGoods(sample, '', 'X')).toBe(sample);
    expect(renameCategoryInGoods(sample, 'Телефони', 'Телефони')).toBe(sample);
  });
});

describe('matchesCategory default «Інше»', () => {
  it('filters uncategorized via sentinel or «Інше» label', () => {
    const list = [
      ...sample,
      p({ id: 'u', title: 'U', price: 1 }),
      p({ id: 'e', title: 'E', price: 1, category: DEFAULT_CATEGORY }),
    ];
    expect(filterAndSortProducts(list, { category: UNCATEGORIZED_KEY }).map((x) => x.id)).toEqual([
      'u',
      'e',
    ]);
    expect(filterAndSortProducts(list, { category: DEFAULT_CATEGORY }).map((x) => x.id)).toEqual([
      'u',
      'e',
    ]);
  });
});

describe('productCategoryKey / display / normalize', () => {
  it('returns sentinel for empty or «Інше»', () => {
    expect(productCategoryKey(p({ id: 'a', title: 'A', price: 1 }))).toBe(UNCATEGORIZED_KEY);
    expect(productCategoryKey(p({ id: 'a', title: 'A', price: 1, category: DEFAULT_CATEGORY }))).toBe(
      UNCATEGORIZED_KEY,
    );
    expect(productCategoryKey(p({ id: 'a', title: 'A', price: 1, category: '  Телефони ' }))).toBe(
      'Телефони',
    );
  });

  it('displayCategory always shows a label', () => {
    expect(displayCategory(p({ id: 'a', title: 'A', price: 1 }))).toBe(DEFAULT_CATEGORY);
    expect(displayCategory(p({ id: 'a', title: 'A', price: 1, category: 'ТВ' }))).toBe('ТВ');
    expect(UNCATEGORIZED_LABEL).toBe(DEFAULT_CATEGORY);
  });

  it('normalizeCategoryInput collapses «Інше» to undefined', () => {
    expect(normalizeCategoryInput('')).toBeUndefined();
    expect(normalizeCategoryInput(DEFAULT_CATEGORY)).toBeUndefined();
    expect(normalizeCategoryInput('  Телефони ')).toBe('Телефони');
  });

  it('isDefaultCategory', () => {
    expect(isDefaultCategory(p({ id: 'a', title: 'A', price: 1 }))).toBe(true);
    expect(isDefaultCategory(p({ id: 'a', title: 'A', price: 1, category: 'ТВ' }))).toBe(false);
  });
});

describe('applySortPin / sortProducts pin', () => {
  it('moves pinned products first while keeping relative order', () => {
    const list = [
      p({ id: 'a', title: 'A', price: 1 }),
      p({ id: 'b', title: 'B', price: 2, sortPin: true }),
      p({ id: 'c', title: 'C', price: 3 }),
      p({ id: 'd', title: 'D', price: 4, sortPin: true }),
    ];
    const sorted = sortProducts(list, 'manual');
    expect(sorted.map((x) => x.id)).toEqual(['b', 'd', 'a', 'c']);
  });

  it('keeps pins on top for price sort', () => {
    const list = [
      p({ id: 'cheap', title: 'Cheap', price: 10 }),
      p({ id: 'pin', title: 'Pin', price: 999, sortPin: true }),
      p({ id: 'mid', title: 'Mid', price: 50 }),
    ];
    const sorted = sortProducts(list, 'price-asc');
    expect(sorted[0].id).toBe('pin');
    expect(sorted.slice(1).map((x) => x.id)).toEqual(['cheap', 'mid']);
  });
});

describe('validateCategoryName', () => {
  it('refuses blank or whitespace', () => {
    expect(validateCategoryName('')).toEqual({ valid: false, error: 'Назва категорії не може бути порожньою' });
    expect(validateCategoryName('   ')).toEqual({ valid: false, error: 'Назва категорії не може бути порожньою' });
    expect(validateCategoryName(null)).toEqual({ valid: false, error: 'Назва категорії не може бути порожньою' });
  });

  it('refuses more than 120 characters', () => {
    const longName = 'а'.repeat(121);
    expect(validateCategoryName(longName)).toEqual({
      valid: false,
      error: 'Назва категорії не може перевищувати 120 символів',
    });
  });

  it('refuses reserved names «Інше» and «Усі» case-insensitively', () => {
    expect(validateCategoryName('Інше')).toEqual({ valid: false, error: '«Інше» — зарезервована назва' });
    expect(validateCategoryName('  інше  ')).toEqual({ valid: false, error: '«Інше» — зарезервована назва' });
    expect(validateCategoryName('Усі')).toEqual({ valid: false, error: '«Усі» — зарезервована назва' });
    expect(validateCategoryName('  усі ')).toEqual({ valid: false, error: '«Усі» — зарезервована назва' });
  });

  it('refuses case-insensitive duplicate in existing categories', () => {
    const existing = ['Догляд', 'Макіяж'];
    expect(validateCategoryName('догляд', existing)).toEqual({
      valid: false,
      error: 'Категорія з такою назвою вже існує',
    });
    expect(validateCategoryName('  ДОГЛЯД  ', existing)).toEqual({
      valid: false,
      error: 'Категорія з такою назвою вже існує',
    });
  });

  it('allows case-only rename when ignore option matches', () => {
    const existing = ['Догляд', 'Макіяж'];
    expect(validateCategoryName('догляд', existing, { ignore: 'Догляд' })).toEqual({
      valid: true,
      name: 'догляд',
    });
  });

  it('accepts valid new category name', () => {
    const existing = ['Догляд'];
    expect(validateCategoryName('  Парфуми  ', existing)).toEqual({
      valid: true,
      name: 'Парфуми',
    });
  });
});

describe('mergeCategoryNames', () => {
  it('unions stored and product categories, dropping reserved and blank names', () => {
    const stored = ['ТВ', 'Інше', '  ', 'Аксесуари'];
    const goods = [
      p({ id: '1', title: 'P1', price: 10, category: 'Телефони' }),
      p({ id: '2', title: 'P2', price: 20, category: 'Усі' }),
      p({ id: '3', title: 'P3', price: 30, category: DEFAULT_CATEGORY }),
      p({ id: '4', title: 'P4', price: 40 }),
      p({ id: '5', title: 'P5', price: 50, category: 'ТВ' }),
    ];
    const merged = mergeCategoryNames(stored, goods);
    expect(merged).toEqual(['Аксесуари', 'ТВ', 'Телефони']);
  });

  it('keeps pre-existing chips that differ only by case as separate chips', () => {
    const stored = ['Догляд', 'догляд'];
    const goods: Product[] = [];
    const merged = mergeCategoryNames(stored, goods);
    expect(merged).toContain('Догляд');
    expect(merged).toContain('догляд');
  });

  it('handles empty stored gracefully', () => {
    const goods = [p({ id: '1', title: 'P1', price: 10, category: 'Новинки' })];
    expect(mergeCategoryNames(undefined, goods)).toEqual(['Новинки']);
    expect(mergeCategoryNames([], goods)).toEqual(['Новинки']);
  });
});

describe('deleteNamedCategory', () => {
  it('moves matching products to default bucket and removes category from list', () => {
    const categories = ['Ноутбуки', 'ТВ', 'Телефони'];
    const { goods, categories: nextCats, movedCount } = deleteNamedCategory(sample, categories, 'Телефони');
    expect(movedCount).toBe(2);
    expect(nextCats).toEqual(['Ноутбуки', 'ТВ']);
    // Matching products now have undefined category (default bucket)
    const p1 = goods.find((g) => g.id === '1');
    const p3 = goods.find((g) => g.id === '3');
    expect(p1?.category).toBeUndefined();
    expect(p3?.category).toBeUndefined();
    // Non-matching product unchanged
    expect(goods.find((g) => g.id === '2')?.category).toBe('ТВ');
  });

  it('deleting an empty category moves 0 products and removes chip', () => {
    const categories = ['Порожня', 'ТВ'];
    const { goods, categories: nextCats, movedCount } = deleteNamedCategory(sample, categories, 'Порожня');
    expect(movedCount).toBe(0);
    expect(nextCats).toEqual(['ТВ']);
    expect(goods).toEqual(sample);
  });
});

describe('renameStoredCategory', () => {
  const categories = ['Ноутбуки', 'ТВ', 'Телефони'];

  it('refuses blank or reserved names', () => {
    const res1 = renameStoredCategory(sample, categories, 'ТВ', '');
    expect(res1.success).toBe(false);
    expect(res1.error).toContain('порожньою');

    const res2 = renameStoredCategory(sample, categories, 'ТВ', 'Інше');
    expect(res2.success).toBe(false);
    expect(res2.error).toContain('зарезервована');

    const res3 = renameStoredCategory(sample, categories, 'ТВ', 'усі');
    expect(res3.success).toBe(false);
    expect(res3.error).toContain('зарезервована');

    const res4 = renameStoredCategory(sample, categories, 'Інше', 'Щось');
    expect(res4.success).toBe(false);
  });

  it('renames to a new name updating category list and goods', () => {
    const res = renameStoredCategory(sample, categories, 'Телефони', 'Смартфони');
    expect(res.success).toBe(true);
    expect(res.categories).toContain('Смартфони');
    expect(res.categories).not.toContain('Телефони');
    expect(res.targetName).toBe('Смартфони');
    expect(res.goods.filter((g) => g.category === 'Смартфони')).toHaveLength(2);
  });

  it('case-only rename updates stored spelling and product strings', () => {
    const res = renameStoredCategory(sample, categories, 'Телефони', 'телефони');
    expect(res.success).toBe(true);
    expect(res.categories).toContain('телефони');
    expect(res.categories).not.toContain('Телефони');
    expect(res.targetName).toBe('телефони');
    expect(res.goods.filter((g) => g.category === 'телефони')).toHaveLength(2);
  });

  it('fold-match to a different existing chip merges goods and drops fromKey', () => {
    // Merging 'Телефони' into 'тв' -> canonical existing spelling 'ТВ'
    const res = renameStoredCategory(sample, categories, 'Телефони', 'тв');
    expect(res.success).toBe(true);
    expect(res.categories).toContain('ТВ');
    expect(res.categories).not.toContain('Телефони');
    expect(res.targetName).toBe('ТВ');
    // Products from 'Телефони' (id: 1, 3) + original 'ТВ' (id: 2) -> 3 products
    expect(res.goods.filter((g) => g.category === 'ТВ')).toHaveLength(3);
  });
});

describe('upsertCategoryName', () => {
  it('appends a new category and sorts by Ukrainian locale', () => {
    const initial = ['Б', 'Г'];
    const res = upsertCategoryName(initial, 'А');
    expect(res.isNew).toBe(true);
    expect(res.canonical).toBe('А');
    expect(res.categories).toEqual(['А', 'Б', 'Г']);
  });

  it('returns canonical spelling when fold matches existing category', () => {
    const initial = ['Догляд'];
    const res = upsertCategoryName(initial, 'догляд');
    expect(res.isNew).toBe(false);
    expect(res.canonical).toBe('Догляд');
    expect(res.categories).toEqual(['Догляд']);
  });
});

describe('emptyCategoryGroups', () => {
  it('returns stored categories that have no products', () => {
    const categories = ['Ноутбуки', 'ТВ', 'Телефони', 'Порожня 1', 'Порожня 2'];
    const empty = emptyCategoryGroups(categories, sample);
    expect(empty).toEqual(['Порожня 1', 'Порожня 2']);
  });

  it('category with only hidden products is not considered empty', () => {
    // sample has product id '2' with category 'ТВ' and visible: false
    const categories = ['ТВ', 'Порожня'];
    const empty = emptyCategoryGroups(categories, sample);
    expect(empty).toEqual(['Порожня']);
  });
});

describe('groupProductsByCategory with emptyCategories', () => {
  it('inserts empty groups immediately before «Інше» without reshuffling populated groups', () => {
    const list = [
      ...sample,
      p({ id: 'u', title: 'Без категорії', price: 10 }), // uncategorized -> will create «Інше»
    ];
    // Populate in first-seen order: sample has 'Телефони' first, then 'ТВ', then 'Ноутбуки'
    const groups = groupProductsByCategory(list, {
      emptyCategories: ['Порожня Б', 'Порожня А'],
    });

    const keys = groups.map((g) => g.key);
    // Populated first-seen order: Телефони, ТВ, Ноутбуки
    // Then empty categories sorted: Порожня А, Порожня Б
    // Then uncategorized sentinel: UNCATEGORIZED_KEY
    expect(keys).toEqual(['Телефони', 'ТВ', 'Ноутбуки', 'Порожня А', 'Порожня Б', UNCATEGORIZED_KEY]);

    const emptyGroup = groups.find((g) => g.key === 'Порожня А');
    expect(emptyGroup?.total).toBe(0);
    expect(emptyGroup?.visibleCount).toBe(0);
    expect(emptyGroup?.products).toEqual([]);
    expect(emptyGroup?.label).toBe('Порожня А');
  });

  it('empty category survives when its last product leaves', () => {
    // When category is deleted from all products, it still exists in categories array
    const storedCategories = ['ТВ', 'Телефони'];
    const goodsWithoutPhones = sample.filter((g) => g.category !== 'Телефони');
    const empty = emptyCategoryGroups(storedCategories, goodsWithoutPhones);
    expect(empty).toContain('Телефони');
  });
});

describe('getGroupCheckState', () => {
  it('returns none for empty group or no selections', () => {
    expect(getGroupCheckState([], {})).toBe('none');
    expect(getGroupCheckState(['1', '2'], {})).toBe('none');
    expect(getGroupCheckState(['1', '2'], { '3': true })).toBe('none');
  });

  it('returns some when partially checked', () => {
    expect(getGroupCheckState(['1', '2', '3'], { '2': true })).toBe('some');
    expect(getGroupCheckState(['1', '2'], { '1': true, '3': true })).toBe('some');
  });

  it('returns all when every id is checked', () => {
    expect(getGroupCheckState(['1', '2'], { '1': true, '2': true })).toBe('all');
    expect(getGroupCheckState(['1'], { '1': true, 'extra': true })).toBe('all');
  });
});

describe('toggleGroupSelection', () => {
  it('selects all group items when none or some are selected, preserving others', () => {
    const initial = { 'other': true, '1': true };
    const next = toggleGroupSelection(initial, ['1', '2', '3']);
    expect(next['other']).toBe(true);
    expect(next['1']).toBe(true);
    expect(next['2']).toBe(true);
    expect(next['3']).toBe(true);
  });

  it('unselects only group items when all group items are selected, preserving others', () => {
    const initial = { 'other': true, '1': true, '2': true };
    const next = toggleGroupSelection(initial, ['1', '2']);
    expect(next['other']).toBe(true);
    expect(next['1']).toBeUndefined();
    expect(next['2']).toBeUndefined();
  });

  it('handles empty group gracefully', () => {
    const initial = { '1': true };
    expect(toggleGroupSelection(initial, [])).toEqual(initial);
  });
});

describe('moveGoodsCategory', () => {
  it('moves checked products to a named category, skipping products already there', () => {
    // sample[0] ('1') is 'Телефони', sample[1] ('2') is 'ТВ', sample[2] ('3') is 'Телефони'
    const res = moveGoodsCategory(sample, ['1', '2', '3'], 'Телефони');
    expect(res.changedCount).toBe(1); // only '2' was moved
    expect(res.alreadyInTargetCount).toBe(2); // '1' and '3' were already in 'Телефони'
    expect(res.goods.find((p) => p.id === '2')?.category).toBe('Телефони');
    // Verify catalog order is preserved
    expect(res.goods.map((p) => p.id)).toEqual(sample.map((p) => p.id));
  });

  it('moves products to «Інше» storing undefined', () => {
    const res = moveGoodsCategory(sample, ['1'], 'Інше');
    expect(res.changedCount).toBe(1);
    expect(res.alreadyInTargetCount).toBe(0);
    expect(res.goods.find((p) => p.id === '1')?.category).toBeUndefined();
  });

  it('skips products already uncategorized when moving to «Інше»', () => {
    const uncat = p({ id: 'u1', title: 'Без категорії', price: 100 });
    const list = [...sample, uncat];
    const res = moveGoodsCategory(list, ['u1', '2'], DEFAULT_CATEGORY);
    expect(res.changedCount).toBe(1); // only '2' moved to default
    expect(res.alreadyInTargetCount).toBe(1); // 'u1' already default
    expect(res.goods.find((p) => p.id === 'u1')?.category).toBeUndefined();
    expect(res.goods.find((p) => p.id === '2')?.category).toBeUndefined();
  });

  it('does not modify non-selected items', () => {
    const res = moveGoodsCategory(sample, ['1'], 'Косметика');
    expect(res.goods.find((p) => p.id === '2')?.category).toBe('ТВ');
    expect(res.goods.find((p) => p.id === '3')?.category).toBe('Телефони');
    expect(res.goods.find((p) => p.id === '4')?.category).toBe('Ноутбуки');
  });
});

describe('setGoodsVisibility', () => {
  it('changes visibility and skips products already in target state', () => {
    // sample: '1' visible (true), '2' hidden (false), '3' visible (true)
    const hideRes = setGoodsVisibility(sample, ['1', '2', '3'], false);
    expect(hideRes.changedCount).toBe(2); // '1' and '3' changed to false
    expect(hideRes.alreadyInTargetCount).toBe(1); // '2' was already false
    expect(hideRes.goods.find((p) => p.id === '1')?.visible).toBe(false);
    expect(hideRes.goods.find((p) => p.id === '2')?.visible).toBe(false);

    const showRes = setGoodsVisibility(sample, ['1', '2'], true);
    expect(showRes.changedCount).toBe(1); // only '2' changed to true
    expect(showRes.alreadyInTargetCount).toBe(1); // '1' was already true
    expect(showRes.goods.find((p) => p.id === '2')?.visible).toBe(true);
  });
});

describe('formatBulkConfirmMessage', () => {
  it('returns null when changedCount is 0', () => {
    expect(
      formatBulkConfirmMessage({
        action: 'show',
        changedCount: 0,
        alreadyInTargetCount: 3,
      }),
    ).toBeNull();
    expect(
      formatBulkConfirmMessage({
        action: 'move',
        targetCategoryLabel: 'Волосся',
        changedCount: 0,
        alreadyInTargetCount: 5,
        dirty: true,
      }),
    ).toBeNull();
  });

  it('formats basic confirmation prompts', () => {
    expect(
      formatBulkConfirmMessage({
        action: 'show',
        changedCount: 5,
        alreadyInTargetCount: 0,
      }),
    ).toBe('Показати 5 товар(ів)?');

    expect(
      formatBulkConfirmMessage({
        action: 'hide',
        changedCount: 3,
        alreadyInTargetCount: 0,
      }),
    ).toBe('Приховати 3 товар(ів)?');

    expect(
      formatBulkConfirmMessage({
        action: 'move',
        targetCategoryLabel: 'Волосся',
        changedCount: 4,
        alreadyInTargetCount: 0,
      }),
    ).toBe('Перенести 4 товар(ів) у «Волосся»?');
  });

  it('appends note when some products were already in target state', () => {
    expect(
      formatBulkConfirmMessage({
        action: 'show',
        changedCount: 2,
        alreadyInTargetCount: 1,
      }),
    ).toBe('Показати 2 товар(ів)?\n\n1 вже показано.');

    expect(
      formatBulkConfirmMessage({
        action: 'hide',
        changedCount: 4,
        alreadyInTargetCount: 2,
      }),
    ).toBe('Приховати 4 товар(ів)?\n\n2 вже приховано.');

    expect(
      formatBulkConfirmMessage({
        action: 'move',
        targetCategoryLabel: 'Тіло',
        changedCount: 3,
        alreadyInTargetCount: 2,
      }),
    ).toBe('Перенести 3 товар(ів) у «Тіло»?\n\n2 вже в цій групі.');
  });

  it('appends dirty warning and combinations', () => {
    expect(
      formatBulkConfirmMessage({
        action: 'move',
        targetCategoryLabel: 'Волосся',
        changedCount: 2,
        alreadyInTargetCount: 1,
        dirty: true,
      }),
    ).toBe('Перенести 2 товар(ів) у «Волосся»?\n\n1 вже в цій групі.\n\nІнші незбережені зміни товарів теж буде збережено.');

    expect(
      formatBulkConfirmMessage({
        action: 'hide',
        changedCount: 1,
        alreadyInTargetCount: 0,
        dirty: true,
      }),
    ).toBe('Приховати 1 товар(ів)?\n\nІнші незбережені зміни товарів теж буде збережено.');
  });
});



