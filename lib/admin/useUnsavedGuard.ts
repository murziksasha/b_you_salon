'use client';

import { useEffect } from 'react';

/** Warn on tab close / refresh and in-app admin link clicks when dirty. */
export function useUnsavedGuard(dirty: boolean) {
  useEffect(() => {
    if (!dirty) return;

    function onBeforeUnload(e: BeforeUnloadEvent) {
      e.preventDefault();
      e.returnValue = '';
    }

    function onClick(e: MouseEvent) {
      const target = e.target as HTMLElement | null;
      if (!target) return;
      const anchor = target.closest('a[href]') as HTMLAnchorElement | null;
      if (!anchor) return;
      if (anchor.target === '_blank' || anchor.hasAttribute('download')) return;
      const href = anchor.getAttribute('href');
      if (!href || href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('tel:')) return;
      try {
        const url = new URL(href, window.location.origin);
        if (url.origin !== window.location.origin) return;
        // Only guard admin SPA navigations
        if (!url.pathname.startsWith('/admin')) return;
        if (url.pathname === window.location.pathname && url.search === window.location.search) return;
      } catch {
        return;
      }
      const ok = window.confirm('Є незбережені зміни. Залишити сторінку?');
      if (!ok) {
        e.preventDefault();
        e.stopPropagation();
      }
    }

    window.addEventListener('beforeunload', onBeforeUnload);
    document.addEventListener('click', onClick, true);
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload);
      document.removeEventListener('click', onClick, true);
    };
  }, [dirty]);
}

/**
 * Ctrl/Cmd+S triggers save when dirty (or always if `requireDirty` is false).
 */
export function useSaveShortcut(
  save: () => void | Promise<void>,
  options: { enabled?: boolean; requireDirty?: boolean; dirty?: boolean } = {},
) {
  const { enabled = true, requireDirty = true, dirty = true } = options;

  useEffect(() => {
    if (!enabled) return;
    if (requireDirty && !dirty) return;

    function onKeyDown(e: KeyboardEvent) {
      const isSave = (e.ctrlKey || e.metaKey) && (e.key === 's' || e.key === 'S');
      if (!isSave) return;
      e.preventDefault();
      void save();
    }

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [save, enabled, requireDirty, dirty]);
}
