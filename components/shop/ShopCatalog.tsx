'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import type { Product } from '@/lib/types';
import {
  PRODUCT_SORT_OPTIONS,
  parseProductSort,
  type ProductCardDTO,
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

export interface ShopCatalogProps {
  /** First batch of 36 cards from SSR */
  initialItems?: ProductCardDTO[];
  /** Legacy prop for backward compatibility */
  products?: Product[];
  initialTotal?: number;
  initialHasMore?: boolean;
  categories?: string[];
  initialQuery?: string;
  initialSort?: ProductSort;
  initialCategory?: string;
}

export function ShopCatalog({
  initialItems = [],
  products = [],
  initialTotal,
  initialHasMore = false,
  categories = [],
  initialQuery = '',
  initialSort = 'manual',
  initialCategory = '',
}: ShopCatalogProps) {
  const pathname = usePathname();

  // Initialize with initialItems or fallback to products
  const startingItems: (Product | ProductCardDTO)[] = initialItems.length ? initialItems : products;
  const startingTotal = typeof initialTotal === 'number' ? initialTotal : startingItems.length;

  const [items, setItems] = useState<(Product | ProductCardDTO)[]>(startingItems);
  const [total, setTotal] = useState(startingTotal);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [page, setPage] = useState(1);

  const [query, setQuery] = useState(initialQuery);
  const [debouncedQuery, setDebouncedQuery] = useState(initialQuery);
  const [sort, setSort] = useState<ProductSort>(initialSort);
  const [category, setCategory] = useState(initialCategory);

  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);

  const activeFilterKeyRef = useRef(catalogKey(initialQuery, initialSort, initialCategory));
  const inFlightControllerRef = useRef<AbortController | null>(null);
  const lastSyncedKey = useRef(catalogKey(initialQuery, initialSort, initialCategory));
  const isFirstRender = useRef(true);

  // Debounce search typing
  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedQuery(query), DEBOUNCE_MS);
    return () => window.clearTimeout(t);
  }, [query]);

  // Sync URL query params
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
      const targetUrl = qs ? `${pathname}?${qs}` : pathname;
      if (typeof window !== 'undefined') {
        window.history.replaceState(null, '', targetUrl);
      }
    },
    [pathname],
  );

  // Fetch page 1 when filters change (skip initial mount)
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }

    const currentKey = catalogKey(debouncedQuery, sort, category);
    activeFilterKeyRef.current = currentKey;
    syncUrl({ q: debouncedQuery, sort, category });

    // Cancel in-flight page-1 request
    if (inFlightControllerRef.current) {
      inFlightControllerRef.current.abort();
    }
    const controller = new AbortController();
    inFlightControllerRef.current = controller;

    setLoading(true);
    setFetchError(null);
    setItems([]); // Clear stale cards when filters change
    setPage(1);

    const params = new URLSearchParams();
    if (debouncedQuery.trim()) params.set('q', debouncedQuery.trim());
    if (sort !== 'manual') params.set('sort', sort);
    if (category.trim()) params.set('category', category.trim());
    params.set('page', '1');
    params.set('pageSize', '36');

    fetch(`/api/catalog?${params.toString()}`, { signal: controller.signal })
      .then((res) => {
        if (!res.ok) throw new Error(`Catalog fetch returned ${res.status}`);
        return res.json();
      })
      .then((data) => {
        if (controller.signal.aborted) return;
        if (activeFilterKeyRef.current !== currentKey) return;
        setItems(data.items || []);
        setTotal(data.total || 0);
        setHasMore(Boolean(data.hasMore));
        setFetchError(null);
      })
      .catch((err: unknown) => {
        if ((err as Error)?.name === 'AbortError') return;
        if (activeFilterKeyRef.current !== currentKey) return;
        setFetchError('Не вдалося завантажити товари. Перевірте зʼєднання або спробуйте знову.');
        setItems([]);
        setTotal(0);
        setHasMore(false);
      })
      .finally(() => {
        if (!controller.signal.aborted && activeFilterKeyRef.current === currentKey) {
          setLoading(false);
        }
      });

    return () => {
      controller.abort();
    };
  }, [debouncedQuery, sort, category, syncUrl, retryCount]);

  // Back/forward browser navigation
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

  // "Показати більше" (append next 36 cards)
  const handleLoadMore = useCallback(() => {
    // Disable show-more while page one is loading or page two is pending
    if (loading || loadingMore || !hasMore) return;
    setLoadingMore(true);
    const nextPage = page + 1;
    const requestedKey = catalogKey(debouncedQuery, sort, category);

    const params = new URLSearchParams();
    if (debouncedQuery.trim()) params.set('q', debouncedQuery.trim());
    if (sort !== 'manual') params.set('sort', sort);
    if (category.trim()) params.set('category', category.trim());
    params.set('page', String(nextPage));
    params.set('pageSize', '36');

    fetch(`/api/catalog?${params.toString()}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        // Discard page-2 response if filters changed while request was in-flight
        if (!data?.items || activeFilterKeyRef.current !== requestedKey) return;
        setItems((prev) => [...prev, ...data.items]);
        setPage(nextPage);
        setHasMore(Boolean(data.hasMore));
        setTotal(data.total || 0);
      })
      .catch(() => {})
      .finally(() => {
        if (activeFilterKeyRef.current === requestedKey) {
          setLoadingMore(false);
        }
      });
  }, [loading, loadingMore, hasMore, page, debouncedQuery, sort, category]);

  function reset() {
    setQuery('');
    setDebouncedQuery('');
    setSort('manual');
    setCategory('');
  }

  const active = Boolean(debouncedQuery.trim() || sort !== 'manual' || category.trim());

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
            <button type='button' className='by-btn by-btn--ghost shop-toolbar__reset' onClick={reset}>
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
        {loading
          ? 'Пошук товарів…'
          : fetchError
            ? 'Помилка завантаження'
            : total === 0
              ? 'Нічого не знайдено'
              : items.length >= total
                ? `Товарів: ${total}`
                : `Показано ${items.length} з ${total}`}
      </p>

      {fetchError ? (
        <div className='shop-empty' style={{ margin: '2rem 0' }}>
          <p>{fetchError}</p>
          <button
            type='button'
            className='by-btn shop-empty__btn'
            onClick={() => setRetryCount((c) => c + 1)}
          >
            Спробувати знову
          </button>
        </div>
      ) : items.length ? (
        <>
          <ProductGrid products={items} />
          {hasMore ? (
            <div className='shop-catalog__more' style={{ textAlign: 'center', marginTop: '2rem' }}>
              <button
                type='button'
                className='by-btn by-btn--outline shop-catalog__more-btn'
                onClick={handleLoadMore}
                disabled={loading || loadingMore}
              >
                {loadingMore ? 'Завантаження…' : 'Показати більше'}
              </button>
            </div>
          ) : null}
        </>
      ) : loading ? (
        <div className='shop-empty'>
          <p>Завантаження каталогу…</p>
        </div>
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
