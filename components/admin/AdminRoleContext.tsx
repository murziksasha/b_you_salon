'use client';

import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { navAllowedForRole, type AdminRole } from '@/lib/admin-roles';

type Ctx = {
  username: string;
  role: AdminRole | 'legacy';
  loading: boolean;
  canNav: (href: string) => boolean;
};

const AdminRoleContext = createContext<Ctx>({
  username: 'admin',
  role: 'legacy',
  loading: true,
  canNav: () => true,
});

export function AdminRoleProvider({ children }: { children: React.ReactNode }) {
  const [username, setUsername] = useState('admin');
  const [role, setRole] = useState<AdminRole | 'legacy'>('legacy');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch('/api/auth');
        if (!res.ok) return;
        const json = (await res.json()) as {
          user?: { username?: string; role?: string };
        };
        if (json.user?.username) setUsername(json.user.username);
        const r = json.user?.role;
        if (r === 'owner' || r === 'editor' || r === 'operator' || r === 'legacy') {
          setRole(r);
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
      loading,
      canNav: (href: string) => navAllowedForRole(role, href),
    }),
    [username, role, loading],
  );

  return <AdminRoleContext.Provider value={value}>{children}</AdminRoleContext.Provider>;
}

export function useAdminRole(): Ctx {
  return useContext(AdminRoleContext);
}
