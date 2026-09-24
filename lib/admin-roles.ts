export type AdminRole = 'owner' | 'editor' | 'operator';

export const ADMIN_CAPABILITIES = [
  'dashboard_view',
  'inbox',
  'leads',
  'orders',
  'clients',
  'activity',
  'content',
  'goods',
  'services',
  'media',
  'settings',
  'telegram',
  'ops',
  'backup',
  'users',
  'security_owner',
  'restore_backup',
] as const;

export type AdminCapability = (typeof ADMIN_CAPABILITIES)[number];

export type AdminPreset = 'operator' | 'editor' | 'full' | 'owner';

export const OWNER_ONLY_CAPABILITIES: readonly AdminCapability[] = [
  'users',
  'security_owner',
  'restore_backup',
];

export const GRANTABLE_CAPABILITIES: readonly AdminCapability[] = ADMIN_CAPABILITIES.filter(
  (c) => !OWNER_ONLY_CAPABILITIES.includes(c),
);

export const ADMIN_CAPABILITY_LABELS: Record<AdminCapability, string> = {
  dashboard_view: 'Огляд',
  inbox: 'Inbox',
  leads: 'Заявки',
  orders: 'Замовлення',
  clients: 'Клієнти',
  activity: 'Активність',
  content: 'Сторінки та меню',
  goods: 'Товари',
  services: 'Послуги',
  media: 'Медіатека',
  settings: 'Налаштування сайту',
  telegram: 'Telegram-бот',
  ops: 'Ops',
  backup: 'Бекапи',
  users: 'Користувачі',
  security_owner: 'Безпека власника',
  restore_backup: 'Відновлення',
};

export const ADMIN_CAPABILITY_GROUPS: Array<{ id: string; label: string; keys: AdminCapability[] }> = [
  {
    id: 'ops',
    label: 'Операції',
    keys: ['dashboard_view', 'inbox', 'leads', 'orders', 'clients', 'activity'],
  },
  {
    id: 'content',
    label: 'Контент',
    keys: ['content', 'goods', 'services', 'media'],
  },
  {
    id: 'system',
    label: 'Система',
    keys: ['settings', 'telegram', 'ops', 'backup'],
  },
];

const CAP_SET = new Set<string>(ADMIN_CAPABILITIES);

export function isAdminCapability(value: unknown): value is AdminCapability {
  return typeof value === 'string' && CAP_SET.has(value);
}

export function isAdminRole(value: unknown): value is AdminRole {
  return value === 'owner' || value === 'editor' || value === 'operator';
}

/** Map legacy/API action aliases onto a capability. */
export function normalizeCapability(action: string): AdminCapability | null {
  if (action === 'stats') return 'dashboard_view';
  return isAdminCapability(action) ? action : null;
}

export function presetGrants(preset: AdminPreset | AdminRole): AdminCapability[] {
  if (preset === 'owner') return [...ADMIN_CAPABILITIES];
  const operator: AdminCapability[] = [
    'dashboard_view',
    'inbox',
    'leads',
    'orders',
    'clients',
    'activity',
  ];
  if (preset === 'operator') return operator;
  // editor + full: everything grantable
  return [...GRANTABLE_CAPABILITIES];
}

export function roleFromPreset(preset: AdminPreset): AdminRole {
  if (preset === 'owner') return 'owner';
  if (preset === 'operator') return 'operator';
  return 'editor';
}

/** Drop owner-only keys and unknown strings. Owner role ignores stored grants. */
export function sanitizeGrants(role: AdminRole | 'legacy', grants?: unknown): AdminCapability[] | undefined {
  if (role === 'owner' || role === 'legacy') return undefined;
  if (grants === undefined) return undefined;
  if (!Array.isArray(grants)) return [];
  const seen = new Set<AdminCapability>();
  const out: AdminCapability[] = [];
  for (const raw of grants) {
    if (!isAdminCapability(raw)) continue;
    if (OWNER_ONLY_CAPABILITIES.includes(raw)) continue;
    if (seen.has(raw)) continue;
    seen.add(raw);
    out.push(raw);
  }
  return out;
}

export function capabilitiesFor(
  role: AdminRole | 'legacy',
  grants?: readonly string[],
): Set<AdminCapability> {
  if (role === 'legacy' || role === 'owner') return new Set(ADMIN_CAPABILITIES);
  if (grants !== undefined) {
    return new Set(sanitizeGrants(role === 'editor' || role === 'operator' ? role : 'operator', grants) || []);
  }
  return new Set(presetGrants(role === 'editor' ? 'editor' : 'operator'));
}

/** Role permissions for admin routes / UI. Optional grants override the preset (except owner/legacy). */
export function roleCan(
  role: AdminRole | 'legacy',
  action: string,
  grants?: readonly string[],
): boolean {
  if (role === 'legacy' || role === 'owner') return true;
  const cap = normalizeCapability(action);
  if (!cap) return false;
  return capabilitiesFor(role, grants).has(cap);
}

type NavRule = { prefix: string; anyOf: AdminCapability[]; exact?: boolean };

const NAV_RULES: NavRule[] = [
  { prefix: '/admin/inbox', anyOf: ['inbox'] },
  { prefix: '/admin/leads', anyOf: ['leads'] },
  { prefix: '/admin/orders', anyOf: ['orders'] },
  { prefix: '/admin/clients', anyOf: ['clients'] },
  { prefix: '/admin/menu', anyOf: ['content'] },
  { prefix: '/admin/pages', anyOf: ['content'] },
  { prefix: '/admin/preview', anyOf: ['content'] },
  { prefix: '/admin/goods', anyOf: ['goods'] },
  { prefix: '/admin/services', anyOf: ['services'] },
  { prefix: '/admin/media', anyOf: ['media'] },
  { prefix: '/admin/activity', anyOf: ['activity'] },
  { prefix: '/admin/ops', anyOf: ['ops', 'telegram'] },
  { prefix: '/admin/settings', anyOf: ['settings', 'users', 'telegram', 'backup', 'security_owner'] },
  { prefix: '/admin', anyOf: ['dashboard_view'], exact: true },
];

function capsAllow(caps: Set<AdminCapability>, anyOf: AdminCapability[]): boolean {
  return anyOf.some((c) => caps.has(c));
}

/** Nav hrefs allowed for role (prefix match on /admin paths). */
export function navAllowedForRole(
  role: AdminRole | 'legacy',
  href: string,
  grants?: readonly string[],
): boolean {
  const path = href.split('?')[0] || href;
  if (role === 'legacy' || role === 'owner') return true;
  const caps = capabilitiesFor(role, grants);
  for (const rule of NAV_RULES) {
    if (rule.exact) {
      if (path === rule.prefix) return capsAllow(caps, rule.anyOf);
      continue;
    }
    if (path === rule.prefix || path.startsWith(`${rule.prefix}/`)) {
      return capsAllow(caps, rule.anyOf);
    }
  }
  if (path === '/admin' || path === '/admin/') return capsAllow(caps, ['dashboard_view']);
  return false;
}

export function firstAllowedAdminPath(
  role: AdminRole | 'legacy',
  grants?: readonly string[],
): string {
  const candidates = [
    '/admin/inbox',
    '/admin',
    '/admin/leads',
    '/admin/orders',
    '/admin/clients',
    '/admin/goods',
    '/admin/services',
    '/admin/pages',
    '/admin/settings',
    '/admin/ops',
  ];
  for (const href of candidates) {
    if (navAllowedForRole(role, href, grants)) return href;
  }
  return '/admin';
}

export function siteSectionCapability(section: string): AdminCapability | null {
  switch (section) {
    case 'pages':
    case 'headerMenu':
    case 'headerMenuSalon':
    case 'headerMenuShop':
    case 'shopLink':
      return 'content';
    case 'goods':
      return 'goods';
    case 'services':
    case 'servicesNav':
      return 'services';
    case 'settings':
      return 'settings';
    default:
      return null;
  }
}

export function grantsEqual(a?: readonly string[] | null, b?: readonly string[] | null): boolean {
  const aa = [...(a || [])].filter(isAdminCapability).sort();
  const bb = [...(b || [])].filter(isAdminCapability).sort();
  if (aa.length !== bb.length) return false;
  return aa.every((v, i) => v === bb[i]);
}
