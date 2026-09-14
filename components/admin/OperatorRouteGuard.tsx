'use client';

import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useAdminRole } from './AdminRoleContext';

/** Redirect any role away from admin routes they cannot use. */
export function OperatorRouteGuard() {
  const { loading, canNav, fallbackPath } = useAdminRole();
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    if (!pathname.startsWith('/admin')) return;
    if (pathname.startsWith('/admin/login')) return;
    if (!canNav(pathname)) {
      router.replace(fallbackPath);
    }
  }, [loading, pathname, canNav, fallbackPath, router]);

  return null;
}
