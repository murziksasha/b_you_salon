import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { clientIpFromHeaders, getAdminIpAllowlist, isIpAllowed } from '@/lib/admin-ip';
import '@/styles/admin.scss';

export const metadata: Metadata = {
  title: 'Admin | B_You',
  robots: 'noindex',
};

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const headerStore = await headers();

  const allowlist = getAdminIpAllowlist();
  if (allowlist.length > 0) {
    const ip = clientIpFromHeaders(headerStore);
    if (!isIpAllowed(ip, allowlist)) {
      return (
        <div className='admin-body admin-login'>
          <div className='admin-login-card'>
            <p className='admin-login-brand'>B_You</p>
            <h1>Доступ заборонено</h1>
            <p className='admin-login-error'>Ваша IP-адреса не в списку ADMIN_IP_ALLOWLIST.</p>
          </div>
        </div>
      );
    }
  }

  // Set by middleware for protected /admin/* routes (not login)
  const pathname = headerStore.get('x-admin-pathname') || '';

  // Login page: middleware does not set x-admin-pathname
  if (!pathname) {
    return children;
  }

  const ok = await getSession();
  if (!ok) {
    redirect(`/admin/login?from=${encodeURIComponent(pathname)}`);
  }

  return children;
}
