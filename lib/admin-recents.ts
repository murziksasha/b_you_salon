/** Client-only recent admin destinations (localStorage). */

export type RecentEntry = {
  href: string;
  label: string;
  at: number;
};

const KEY = 'admin-recents-v1';
const MAX = 12;

export function readRecents(): RecentEntry[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as RecentEntry[];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((e) => e && typeof e.href === 'string' && typeof e.label === 'string');
  } catch {
    return [];
  }
}

export function pushRecent(href: string, label: string): void {
  if (typeof window === 'undefined') return;
  if (!href.startsWith('/admin')) return;
  if (href.startsWith('/admin/login')) return;
  try {
    const list = readRecents().filter((e) => e.href !== href);
    list.unshift({ href, label, at: Date.now() });
    localStorage.setItem(KEY, JSON.stringify(list.slice(0, MAX)));
  } catch {
    /* ignore */
  }
}

const FAV_KEY = 'admin-favorites-v1';

export function readFavorites(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(FAV_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as string[];
    return Array.isArray(parsed) ? parsed.filter((h) => typeof h === 'string') : [];
  } catch {
    return [];
  }
}

export function toggleFavorite(href: string): string[] {
  const cur = readFavorites();
  const next = cur.includes(href) ? cur.filter((h) => h !== href) : [...cur, href].slice(0, 20);
  try {
    localStorage.setItem(FAV_KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
  return next;
}

export function isFavorite(href: string): boolean {
  return readFavorites().includes(href);
}
