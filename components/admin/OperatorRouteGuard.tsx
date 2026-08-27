'use client';

import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useAdminRole } from './AdminRoleContext';

/** Redirect operators away from content routes they cannot use. */
export function OperatorRouteGuard() {
  const { role, loading, canNav } = useAdminRole();
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    if (role !== 'operator') return;
    if (!pathname.startsWith('/admin')) return;
    if (pathname.startsWith('/admin/login')) return;
    if (!canNav(pathname)) {
      router.replace('/admin/inbox');
    }
  }, [role, loading, pathname, canNav, router]);

  return null;
}
