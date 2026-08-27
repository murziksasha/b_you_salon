'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect } from 'react';
import type { LucideIcon } from 'lucide-react';
import {
  Box,
  Sparkles,
  ClipboardList,
  FileText,
  History,
  Image as ImageIcon,
  Inbox,
  LayoutDashboard,
  LifeBuoy,
  List,
  LogOut,
  PanelLeftClose,
  PanelLeftOpen,
  Settings,
  ShoppingCart,
  Users,
} from 'lucide-react';
import { BrandMark } from '@/components/brand/BrandMark';
import { useAdminCounts } from './AdminCountsContext';
import { useAdminRole } from './AdminRoleContext';

type NavLink = {
  href: string;
  label: string;
  icon: LucideIcon;
  exact?: boolean;
  badge?: 'leads' | 'orders' | 'inbox';
};

type NavGroup = {
  id: string;
  label: string;
  links: NavLink[];
};

const GROUPS: NavGroup[] = [
  {
    id: 'ops',
    label: 'Операції',
    links: [
      { href: '/admin', label: 'Огляд', icon: LayoutDashboard, exact: true },
      { href: '/admin/inbox', label: 'Inbox', icon: Inbox, badge: 'inbox' },
      { href: '/admin/leads', label: 'Заявки', icon: ClipboardList, badge: 'leads' },
      { href: '/admin/orders', label: 'Замовлення', icon: ShoppingCart, badge: 'orders' },
      { href: '/admin/clients', label: 'Клієнти', icon: Users },
    ],
  },
  {
    id: 'content',
    label: 'Контент',
    links: [
      { href: '/admin/menu', label: 'Меню', icon: List },
      { href: '/admin/pages', label: 'Сторінки', icon: FileText },
      { href: '/admin/goods', label: 'Товари', icon: Box },
      { href: '/admin/services', label: 'Послуги', icon: Sparkles },
      { href: '/admin/media', label: 'Медіатека', icon: ImageIcon },
    ],
  },
  {
    id: 'system',
    label: 'Система',
    links: [
      { href: '/admin/activity', label: 'Активність', icon: History },
      { href: '/admin/ops', label: 'Ops', icon: LifeBuoy },
      { href: '/admin/settings', label: 'Налаштування', icon: Settings },
    ],
  },
];

type AdminNavProps = {
  collapsed: boolean;
  mobileOpen: boolean;
  onToggleCollapsed: () => void;
  onCloseMobile: () => void;
};

export function AdminNav({ collapsed, mobileOpen, onToggleCollapsed, onCloseMobile }: AdminNavProps) {
  const pathname = usePathname();
  const counts = useAdminCounts();
  const { canNav, username, role } = useAdminRole();
  const live = counts.live;
  const initial = (username || 'A').slice(0, 1).toUpperCase();

  useEffect(() => {
    onCloseMobile();
  }, [pathname, onCloseMobile]);

  function isActive(href: string, exact?: boolean) {
    if (exact) return pathname === href;
    return pathname === href || pathname.startsWith(`${href}/`);
  }

  function badgeFor(kind?: 'leads' | 'orders' | 'inbox'): number {
    if (kind === 'leads') return counts.openLeads;
    if (kind === 'orders') return counts.openOrders;
    if (kind === 'inbox') return counts.openTotal;
    return 0;
  }

  const visibleGroups = GROUPS.map((group) => ({
    ...group,
    links: group.links.filter((link) => canNav(link.href)),
  })).filter((group) => group.links.length > 0);

  return (
    <nav
      className={`admin-nav${mobileOpen ? ' is-open' : ''}${collapsed ? ' is-collapsed' : ''}`}
      aria-label='Адмін-навігація'
    >
      <div className='admin-nav-brand'>
        <BrandMark href='/admin' className='admin-nav-wordmark' />
        <div className='admin-nav-brand-copy'>
          <h2 className='admin-nav-brand-text'>Адмінка</h2>
          <p className='admin-nav-brand-sub'>B_You studio</p>
        </div>
        <button
          type='button'
          className='admin-nav-collapse-btn'
          aria-label={collapsed ? 'Розгорнути меню' : 'Згорнути меню'}
          title={collapsed ? 'Розгорнути' : 'Згорнути'}
          onClick={onToggleCollapsed}
        >
          {collapsed ? (
            <PanelLeftOpen size={20} strokeWidth={2} aria-hidden />
          ) : (
            <PanelLeftClose size={20} strokeWidth={2} aria-hidden />
          )}
        </button>
      </div>

      <div className='admin-nav-links'>
        {visibleGroups.map((group) => (
          <div key={group.id} className='admin-nav-group'>
            <p className='admin-nav-group-label'>{group.label}</p>
            {group.links.map((link) => {
              const Icon = link.icon;
              const active = isActive(link.href, link.exact);
              const n = badgeFor(link.badge);
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`admin-nav-item${active ? ' active' : ''}`}
                  title={link.label}
                  aria-current={active ? 'page' : undefined}
                  onClick={onCloseMobile}
                >
                  <Icon className='admin-nav-icon' size={20} strokeWidth={1.85} aria-hidden />
                  <span className='admin-nav-label'>{link.label}</span>
                  {n > 0 ? (
                    <span
                      className={`admin-nav-badge${live && link.badge === 'inbox' ? ' is-live' : ''}`}
                      aria-label={`${n} відкритих`}
                    >
                      {n > 99 ? '99+' : n}
                    </span>
                  ) : null}
                </Link>
              );
            })}
          </div>
        ))}
      </div>

      <div className='admin-nav-footer'>
        <div className='admin-nav-user' title={`${username} (${role})`}>
          <span className='admin-nav-avatar' aria-hidden>
            {initial}
          </span>
          <span className='admin-nav-label'>
            {username}
            <span className='admin-nav-role'> · {role}</span>
          </span>
        </div>
        <button
          type='button'
          className='admin-nav-item admin-nav-logout'
          title='Вийти'
          onClick={async () => {
            if (
              !window.confirm(
                'Вийти з адмінки? Незбережені зміни в інших вкладках можуть втратитися.',
              )
            ) {
              return;
            }
            await fetch('/api/auth', { method: 'DELETE' });
            window.location.href = '/admin/login';
          }}
        >
          <LogOut className='admin-nav-icon' size={20} strokeWidth={1.85} aria-hidden />
          <span className='admin-nav-label'>Вийти</span>
        </button>
      </div>
    </nav>
  );
}
