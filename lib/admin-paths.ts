/**
 * First path segment after /admin — keep in sync with app/admin/* routes.
 * Used to validate post-login `from` redirects (avoid /admin/l → public 404).
 */
export const ADMIN_SECTIONS = new Set([
  '',
  'inbox',
  'leads',
  'orders',
  'clients',
  'menu',
  'pages',
  'goods',
  'services',
  'media',
  'activity',
  'ops',
  'settings',
  'preview',
]);

export function isKnownAdminPath(pathname: string): boolean {
  if (!pathname.startsWith('/admin')) return false;
  const parts = pathname.split('/').filter(Boolean);
  if (parts[0] !== 'admin') return false;
  const section = parts[1] || '';
  if (section === 'login') return false;
  return ADMIN_SECTIONS.has(section);
}

/** Safe return URL after admin login. Invalid/typo paths fall back to /admin. */
export function safeAdminReturnPath(raw: string | null | undefined): string {
  if (!raw) return '/admin';
  try {
    const url = new URL(raw, 'http://local.invalid');
    if (!isKnownAdminPath(url.pathname)) return '/admin';
    return `${url.pathname}${url.search}`;
  } catch {
    return '/admin';
  }
}
