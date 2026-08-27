'use client';

import { useEffect, useMemo } from 'react';

/**
 * Warm browser cache for critical image URLs on idle (and once on mount).
 * Safe for public `/img` and `/uploads` paths.
 */
export function usePrefetchImages(urls: string[] | undefined) {
  const key = useMemo(() => {
    if (!urls?.length) return '';
    return [...new Set(urls.filter(Boolean))].sort().join('\0');
  }, [urls]);

  useEffect(() => {
    if (!key) return;
    const list = key.split('\0');

    const run = () => {
      for (const url of list) {
        try {
          const img = new window.Image();
          img.decoding = 'async';
          img.src = url;
        } catch {
          // ignore
        }
      }
    };

    if (typeof window.requestIdleCallback === 'function') {
      const id = window.requestIdleCallback(run, { timeout: 2500 });
      return () => window.cancelIdleCallback(id);
    }
    const t = window.setTimeout(run, 120);
    return () => window.clearTimeout(t);
  }, [key]);
}

/** Prefetch a single URL immediately (hover/focus boost). */
export function prefetchImageUrl(url: string | undefined) {
  if (!url || typeof window === 'undefined') return;
  try {
    const img = new window.Image();
    img.decoding = 'async';
    img.src = url;
  } catch {
    // ignore
  }
}
