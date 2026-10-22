'use client';

import { useEffect } from 'react';

const SW_VERSION = '6';
const SW_URL = `/sw.js?v=${SW_VERSION}`;
const SW_RELOAD_KEY = 'byou-sw-reload';

/**
 * Registers the public service worker.
 * Skips admin routes and non-secure contexts (except localhost).
 * An open tab that already has a controller reloads once when a new worker takes over.
 * The first install does not reload.
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

    const hadController = Boolean(navigator.serviceWorker.controller);
    const justReloaded = sessionStorage.getItem(SW_RELOAD_KEY) === SW_VERSION;
    if (justReloaded) sessionStorage.removeItem(SW_RELOAD_KEY);

    const onControllerChange = () => {
      if (!hadController || justReloaded) return;
      if (sessionStorage.getItem(SW_RELOAD_KEY) === SW_VERSION) return;
      sessionStorage.setItem(SW_RELOAD_KEY, SW_VERSION);
      window.location.reload();
    };

    if (!justReloaded) {
      navigator.serviceWorker.addEventListener('controllerchange', onControllerChange);
    }

    navigator.serviceWorker.register(SW_URL, { scope: '/' }).catch(() => {
      // Silent: PWA is progressive enhancement
    });

    return () => {
      navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange);
    };
  }, []);

  return null;
}
