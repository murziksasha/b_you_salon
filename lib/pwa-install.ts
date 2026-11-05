/**
 * PWA installation helpers.
 */

export const PWA_DISMISS_KEY = 'byou-pwa-install-dismissed';

/**
 * Checks whether the app is currently running in standalone (installed) mode.
 */
export function isStandaloneMode(targetWindow?: {
  matchMedia?: (query: string) => { matches: boolean };
  navigator?: unknown;
}): boolean {
  if (!targetWindow) return false;
  const nav = targetWindow.navigator as { standalone?: boolean } | undefined;
  if (typeof nav?.standalone === 'boolean' && nav.standalone) {
    return true;
  }
  if (typeof targetWindow.matchMedia === 'function') {
    try {
      return targetWindow.matchMedia('(display-mode: standalone)').matches;
    } catch {
      return false;
    }
  }
  return false;
}

/**
 * Detects iOS Safari / iPadOS devices.
 */
export function isIosDevice(userAgent: string, maxTouchPoints = 0): boolean {
  if (!userAgent) return false;
  if (/iPhone|iPad|iPod/i.test(userAgent)) return true;
  if (/Macintosh/i.test(userAgent) && maxTouchPoints > 1) return true;
  return false;
}

/**
 * Checks whether install hint dismissal is stored.
 */
export function isPwaDismissed(storageValue: string | null): boolean {
  return storageValue === '1' || storageValue === 'true';
}
