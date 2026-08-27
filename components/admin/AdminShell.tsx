'use client';

import { useCallback, useEffect, useState } from 'react';
import { AdminNav } from './AdminNav';
import { AdminTopbar } from './AdminTopbar';
import { AdminToastHost } from './AdminToast';
import { AdminCountsProvider } from './AdminCountsContext';
import { AdminRoleProvider } from './AdminRoleContext';
import { CommandPalette } from './CommandPalette';
import { OperatorRouteGuard } from './OperatorRouteGuard';
import { IdleSessionGuard } from './IdleSessionGuard';
import { ShortcutsHelp } from './ShortcutsHelp';
import { AdminBreadcrumb } from './AdminBreadcrumb';

const STORAGE_KEY = 'admin-nav-collapsed';
const DENSITY_KEY = 'admin-density-compact';

export function AdminShell({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [compact, setCompact] = useState(false);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored === '1') setCollapsed(true);
      if (localStorage.getItem(DENSITY_KEY) === '1') setCompact(true);
    } catch {
      /* ignore */
    }
    setHydrated(true);
  }, []);

  const toggleDensity = useCallback(() => {
    setCompact((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(DENSITY_KEY, next ? '1' : '0');
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);

  const toggleCollapsed = useCallback(() => {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(STORAGE_KEY, next ? '1' : '0');
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);

  const toggleMobile = useCallback(() => {
    setMobileOpen((v) => !v);
  }, []);

  const closeMobile = useCallback(() => {
    setMobileOpen(false);
  }, []);

  useEffect(() => {
    if (!mobileOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') closeMobile();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [mobileOpen, closeMobile]);

  return (
    <AdminRoleProvider>
      <AdminCountsProvider>
        <div className={`admin-body${compact && hydrated ? ' admin-body--compact' : ''}`}>
          {mobileOpen ? (
            <button
              type='button'
              className='admin-nav-overlay'
              aria-label='Закрити'
              onClick={closeMobile}
            />
          ) : null}

          <div
            className={`admin-shell${collapsed && hydrated ? ' admin-shell--nav-collapsed' : ''}${
              mobileOpen ? ' admin-shell--nav-open' : ''
            }`}
          >
            <AdminNav
              collapsed={collapsed}
              mobileOpen={mobileOpen}
              onToggleCollapsed={toggleCollapsed}
              onCloseMobile={closeMobile}
            />
            <div className='admin-workspace'>
              <AdminTopbar
                mobileOpen={mobileOpen}
                onToggleMobile={toggleMobile}
                compact={compact}
                onToggleDensity={toggleDensity}
              />
              <main className='admin-main'>
                <OperatorRouteGuard />
                <IdleSessionGuard />
                <AdminBreadcrumb />
                {children}
              </main>
            </div>
          </div>
          <AdminToastHost />
          <CommandPalette />
          <ShortcutsHelp />
        </div>
      </AdminCountsProvider>
    </AdminRoleProvider>
  );
}
