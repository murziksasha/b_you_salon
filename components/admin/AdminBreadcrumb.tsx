'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect } from 'react';
import { pushRecent } from '@/lib/admin-recents';

const LABELS: Record<string, string> = {
  admin: 'Огляд',
  inbox: 'Inbox',
  leads: 'Заявки',
  orders: 'Замовлення',
  clients: 'Клієнти',
  menu: 'Меню',
  pages: 'Сторінки',
  goods: 'Товари',
  services: 'Послуги',
  media: 'Медіатека',
  activity: 'Активність',
  ops: 'Ops',
  settings: 'Налаштування',
  login: 'Вхід',
  preview: 'Preview',
  home: 'Головна',
};

export function AdminBreadcrumb() {
  const pathname = usePathname() || '/admin';

  useEffect(() => {
    if (!pathname.startsWith('/admin') || pathname.startsWith('/admin/login')) return;
    const parts = pathname.split('/').filter(Boolean);
    const last = parts[parts.length - 1] || 'admin';
    const label = LABELS[last] || decodeURIComponent(last);
    pushRecent(pathname, label);
  }, [pathname]);

  if (pathname === '/admin' || pathname === '/admin/') return null;
  if (pathname.startsWith('/admin/login')) return null;

  const parts = pathname.split('/').filter(Boolean);
  // ['admin', 'pages', 'phones']
  const crumbs: Array<{ href: string; label: string }> = [];
  let acc = '';
  for (const part of parts) {
    acc += `/${part}`;
    crumbs.push({
      href: acc,
      label: LABELS[part] || decodeURIComponent(part),
    });
  }

  return (
    <nav className='admin-breadcrumb' aria-label='Шлях'>
      <ol>
        {crumbs.map((c, i) => {
          const last = i === crumbs.length - 1;
          return (
            <li key={c.href}>
              {last ? (
                <span aria-current='page'>{c.label}</span>
              ) : (
                <Link href={c.href}>{c.label}</Link>
              )}
              {!last ? <span className='admin-breadcrumb__sep'>/</span> : null}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
