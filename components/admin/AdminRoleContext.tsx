'use client';

import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import {
  firstAllowedAdminPath,
  isAdminCapability,
  navAllowedForRole,
  roleCan,
  type AdminCapability,
  type AdminRole,
} from '@/lib/admin-roles';

type Ctx = {
  username: string;
  role: AdminRole | 'legacy';
  grants: AdminCapability[];
  loading: boolean;
  can: (action: string) => boolean;
  canNav: (href: string) => boolean;
  fallbackPath: string;
};

const AdminRoleContext = createContext<Ctx>({
  username: 'admin',
  role: 'legacy',
  grants: [],
  loading: true,
  can: () => true,
  canNav: () => true,
  fallbackPath: '/admin',
});

export function AdminRoleProvider({ children }: { children: React.ReactNode }) {
  const [username, setUsername] = useState('admin');
  const [role, setRole] = useState<AdminRole | 'legacy'>('legacy');
  const [grants, setGrants] = useState<AdminCapability[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch('/api/auth');
        if (!res.ok) return;
        const json = (await res.json()) as {
          user?: { username?: string; role?: string; grants?: string[] };
        };
        if (json.user?.username) setUsername(json.user.username);
        const r = json.user?.role;
        if (r === 'owner' || r === 'editor' || r === 'operator' || r === 'legacy') {
          setRole(r);
        }
        if (Array.isArray(json.user?.grants)) {
          setGrants(json.user.grants.filter(isAdminCapability));
        }
      } catch {
        /* ignore */
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const value = useMemo<Ctx>(
    () => ({
      username,
      role,
      grants,
      loading,
      can: (action: string) => roleCan(role, action, grants),
      canNav: (href: string) => navAllowedForRole(role, href, grants),
      fallbackPath: firstAllowedAdminPath(role, grants),
    }),
    [username, role, grants, loading],
  );

  return <AdminRoleContext.Provider value={value}>{children}</AdminRoleContext.Provider>;
}

export function useAdminRole(): Ctx {
  return useContext(AdminRoleContext);
}
