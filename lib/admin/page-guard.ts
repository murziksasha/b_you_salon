import { redirect } from 'next/navigation';
import { getSession, getSessionClaims } from '@/lib/auth';
import { capabilitiesFor, firstAllowedAdminPath, isAdminRole, navAllowedForRole } from '@/lib/admin-roles';
import { resolveAdminAccess, type AdminAccess } from '@/lib/require-role';

export type PageAccessDecision =
  | { kind: 'ok'; access: AdminAccess }
  | { kind: 'login' }
  | { kind: 'redirect'; to: string }
  | { kind: 'setup_2fa' };

/** Pure decision helper (unit-tested): may this access open the admin pathname? */
export function decidePageAccess(
  access: AdminAccess | null,
  pathname: string,
  options?: { setupOnly?: boolean },
): PageAccessDecision {
  if (options?.setupOnly) {
    if (pathname === '/admin/setup-2fa') {
      return access ? { kind: 'ok', access } : { kind: 'setup_2fa' };
    }
    return { kind: 'setup_2fa' };
  }
  if (!access) return { kind: 'login' };
  if (navAllowedForRole(access.role, pathname, access.grants)) return { kind: 'ok', access };
  const to = firstAllowedAdminPath(access.role, access.grants);
  // Avoid redirect loops when nothing is allowed.
  if (to === pathname) return { kind: 'login' };
  return { kind: 'redirect', to };
}

/**
 * Server-side role guard for admin pages. Call at the top of each admin page server component
 * (layouts are not re-rendered on client navigation, so pages must guard themselves).
 */
export async function requirePageAccess(pathname: string): Promise<AdminAccess> {
  const loginUrl = `/admin/login?from=${encodeURIComponent(pathname)}`;
  if (!(await getSession())) redirect(loginUrl);
  const claims = await getSessionClaims();
  if (!claims || !claims.username) redirect(loginUrl);

  if (claims.setupOnly) {
    if (pathname !== '/admin/setup-2fa') {
      redirect('/admin/setup-2fa');
    }
    // Allow rendering /admin/setup-2fa for setup-only session
    const role = isAdminRole(claims.role) ? claims.role : claims.role === 'legacy' ? 'legacy' : 'owner';
    return {
      username: claims.username,
      role,
      grants: [...capabilitiesFor(role)],
    };
  }

  const access = await resolveAdminAccess(claims);
  const decision = decidePageAccess(access, pathname);
  if (decision.kind === 'login') redirect(loginUrl);
  if (decision.kind === 'setup_2fa') redirect('/admin/setup-2fa');
  if (decision.kind === 'redirect') redirect(decision.to);
  return decision.access;
}
