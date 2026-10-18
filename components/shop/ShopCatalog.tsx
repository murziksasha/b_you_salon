'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import type { Product } from '@/lib/types';
import {
  PRODUCT_SORT_OPTIONS,
  collectCategories,
  filterAndSortProducts,
  groupProductsByCategory,
  hasActiveCatalogParams,
  parseProductSort,
  type ProductSort,
} from '@/lib/shop-catalog';
import { ProductGrid } from './ProductGrid';

const DEBOUNCE_MS = 250;

function catalogKey(q: string, sort: ProductSort, category: string): string {
  return `${q.trim()}|${sort}|${category.trim()}`;
}

function readParamsFromLocation(): { q: string; sort: ProductSort; category: string } {
  if (typeof window === 'undefined') {
    return { q: '', sort: 'manual', category: '' };
  }
  const params = new URLSearchParams(window.location.search);
  return {
    q: params.get('q') || '',
    sort: parseProductSort(params.get('sort')),
    category: params.get('category') || '',
  };
}

export function ShopCatalog({
  products,
  initialQuery = '',
  initialSort = 'manual',
  initialCategory = '',
}: {
  products: Product[];
  initialQuery?: string;
  initialSort?: ProductSort;
  initialCategory?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();

  const [query, setQuery] = useState(initialQuery);
  const [debouncedQuery, setDebouncedQuery] = useState(initialQuery);
  const [sort, setSort] = useState<ProductSort>(initialSort);
  const [category, setCategory] = useState(initialCategory);
  const lastSyncedKey = useRef(catalogKey(initialQuery, initialSort, initialCategory));

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedQuery(query), DEBOUNCE_MS);
    return () => window.clearTimeout(t);
  }, [query]);

  const syncUrl = useCallback(
    (next: { q: string; sort: ProductSort; category: string }) => {
      const key = catalogKey(next.q, next.sort, next.category);
      if (key === lastSyncedKey.current) return;
      lastSyncedKey.current = key;

      const params = new URLSearchParams();
      const q = next.q.trim();
      if (q) params.set('q', q);
      if (next.sort !== 'manual') params.set('sort', next.sort);
      if (next.category.trim()) params.set('category', next.category.trim());
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [pathname, router],
  );

  useEffect(() => {
    syncUrl({ q: debouncedQuery, sort, category });
  }, [debouncedQuery, sort, category, syncUrl]);

  // Browser back/forward without useSearchParams (avoids Suspense fallback-only UI)
  useEffect(() => {
    function onPopState() {
      const next = readParamsFromLocation();
      const key = catalogKey(next.q, next.sort, next.category);
      if (key === lastSyncedKey.current) return;
      lastSyncedKey.current = key;
      setQuery(next.q);
      setDebouncedQuery(next.q);
      setSort(next.sort);
      setCategory(next.category);
    }
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  const categories = useMemo(() => collectCategories(products), [products]);

  const filtered = useMemo(
    () =>
      filterAndSortProducts(products, {
        query: debouncedQuery,
        sort,
        category: category || undefined,
      }),
    [products, debouncedQuery, sort, category],
  );

  const active = hasActiveCatalogParams({ query: debouncedQuery, sort, category });

  /** Grouped sections when browsing full catalog in manual order (mirrors admin groups). */
  const showGrouped =
    sort === 'manual' &&
    !debouncedQuery.trim() &&
    !category.trim() &&
    categories.length >= 2;

  const groups = useMemo(
    () => (showGrouped ? groupProductsByCategory(filtered) : []),
    [showGrouped, filtered],
  );

  function reset() {
    setQuery('');
    setDebouncedQuery('');
    setSort('manual');
    setCategory('');
  }

  if (!products.length) {
    return (
      <div className='shop-empty'>
        <p>Наразі в каталозі немає опублікованих товарів.</p>
        <p className='shop-empty__hint'>Зателефонуйте — підкажемо догляд під вашу шкіру.</p>
      </div>
    );
  }

  return (
    <div className='shop-catalog'>
      <div className='shop-toolbar' role='search' aria-label='Фільтри каталогу'>
        <div className='shop-toolbar__row'>
          <label className='shop-toolbar__search'>
            <span className='shop-toolbar__label'>Пошук товару</span>
            <input
              type='search'
              className='shop-toolbar__input'
              placeholder='Назва, опис, категорія…'
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              autoComplete='off'
              enterKeyHint='search'
            />
          </label>

          <label className='shop-toolbar__field'>
            <span className='shop-toolbar__label'>Сортування</span>
            <select
              className='shop-toolbar__select'
              value={sort}
              onChange={(e) => setSort(parseProductSort(e.target.value))}
            >
              {PRODUCT_SORT_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </label>

          {categories.length ? (
            <label className='shop-toolbar__field'>
              <span className='shop-toolbar__label'>Категорія</span>
              <select
                className='shop-toolbar__select'
                value={category}
                onChange={(e) => setCategory(e.target.value)}
              >
                <option value=''>Усі категорії</option>
                {categories.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            </label>
          ) : null}

          {active ? (
            <button type='button' className='shop-toolbar__reset' onClick={reset} aria-label='Скинути фільтри'>
              Скинути
            </button>
          ) : null}
        </div>
      </div>

      {categories.length ? (
        <div className='shop-chips' role='group' aria-label='Швидкий фільтр за категорією'>
          <button
            type='button'
            className={`shop-chip${category === '' ? ' is-active' : ''}`}
            onClick={() => setCategory('')}
          >
            Усі
          </button>
          {categories.map((cat) => (
            <button
              key={cat}
              type='button'
              className={`shop-chip${category === cat ? ' is-active' : ''}`}
              onClick={() => setCategory(cat === category ? '' : cat)}
            >
              {cat}
            </button>
          ))}
        </div>
      ) : null}

      <p className='shop-catalog__meta' aria-live='polite'>
        {filtered.length === products.length
          ? `Товарів: ${products.length}`
          : `Знайдено ${filtered.length} з ${products.length}`}
      </p>

      {filtered.length ? (
        showGrouped ? (
          <div className='shop-groups'>
            {groups.map((group) => (
              <section key={group.key} className='shop-group' aria-labelledby={`shop-group-${group.key}`}>
                <h2 className='shop-group__title' id={`shop-group-${group.key}`}>
                  {group.label}
                  <span className='shop-group__count'>{group.total}</span>
                </h2>
                <ProductGrid products={group.products} />
              </section>
            ))}
          </div>
        ) : (
          <ProductGrid products={filtered} />
        )
      ) : (
        <div className='shop-empty'>
          <p>Нічого не знайдено за вашим запитом.</p>
          <p className='shop-empty__hint'>Спробуйте інші слова або скиньте фільтри.</p>
          {active ? (
            <button type='button' className='by-btn shop-empty__btn' onClick={reset}>
              Скинути фільтри
            </button>
          ) : null}
        </div>
      )}
    </div>
  );
}
