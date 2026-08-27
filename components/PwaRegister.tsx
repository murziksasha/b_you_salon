'use client';

import { useEffect } from 'react';

/**
 * Registers the public service worker for offline shell / asset cache.
 * Skips admin routes and non-secure contexts (except localhost).
 */
export function PwaRegister() {
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!('serviceWorker' in navigator)) return;
    if (window.location.pathname.startsWith('/admin')) return;

    const isLocal =
      window.location.hostname === 'localhost' ||
      window.location.hostname === '127.0.0.1' ||
      window.location.hostname.endsWith('.local');

    if (!window.isSecureContext && !isLocal) return;

    let cancelled = false;

    navigator.serviceWorker
      .register('/sw.js', { scope: '/' })
      .then(() => {
        if (cancelled) return;
      })
      .catch(() => {
        // Silent: PWA is progressive enhancement
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return null;
}
