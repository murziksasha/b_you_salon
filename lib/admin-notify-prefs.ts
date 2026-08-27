/** Client-side notification preferences (localStorage). */

export type NotifyPrefs = {
  mute: boolean;
  /** Only notify on shop orders, not callback leads */
  ordersOnly: boolean;
  /** Local quiet hours, e.g. 22 → 8 means 22:00–08:00 mute */
  quietStart: number;
  quietEnd: number;
  sound: boolean;
  titleBadge: boolean;
};

export const DEFAULT_NOTIFY_PREFS: NotifyPrefs = {
  mute: false,
  ordersOnly: false,
  quietStart: 22,
  quietEnd: 8,
  sound: true,
  titleBadge: true,
};

const KEY = 'admin-notify-prefs-v1';

export function readNotifyPrefs(): NotifyPrefs {
  if (typeof window === 'undefined') return { ...DEFAULT_NOTIFY_PREFS };
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULT_NOTIFY_PREFS };
    return { ...DEFAULT_NOTIFY_PREFS, ...(JSON.parse(raw) as Partial<NotifyPrefs>) };
  } catch {
    return { ...DEFAULT_NOTIFY_PREFS };
  }
}

export function writeNotifyPrefs(prefs: NotifyPrefs): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(prefs));
  } catch {
    /* ignore */
  }
}

export function isQuietNow(prefs: NotifyPrefs, now = new Date()): boolean {
  if (prefs.mute) return true;
  const h = now.getHours();
  const { quietStart, quietEnd } = prefs;
  if (quietStart === quietEnd) return false;
  if (quietStart < quietEnd) {
    // e.g. 1–5 same day
    return h >= quietStart && h < quietEnd;
  }
  // overnight 22–8
  return h >= quietStart || h < quietEnd;
}

export function shouldNotify(
  prefs: NotifyPrefs,
  kind?: string | null,
  now = new Date(),
): boolean {
  if (isQuietNow(prefs, now)) return false;
  if (prefs.ordersOnly && kind === 'lead') return false;
  return true;
}
