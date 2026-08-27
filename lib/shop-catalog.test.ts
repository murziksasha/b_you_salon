import { describe, expect, it } from 'vitest';
import type { Product } from './types';
import {
  DEFAULT_CATEGORY,
  UNCATEGORIZED_KEY,
  UNCATEGORIZED_LABEL,
  collectCategories,
  displayCategory,
  filterAndSortProducts,
  groupProductsByCategory,
  hasActiveCatalogParams,
  isDefaultCategory,
  matchesProductQuery,
  normalizeCategoryInput,
  normalizeQuery,
  parseProductSort,
  productCategoryKey,
  renameCategoryInGoods,
  sortProducts,
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

