import { redirect } from 'next/navigation';
import { getSession, getSessionClaims } from '@/lib/auth';
import { firstAllowedAdminPath, navAllowedForRole } from '@/lib/admin-roles';
import { resolveAdminAccess, type AdminAccess } from '@/lib/require-role';

export type PageAccessDecision =
  { kind: 'ok'; access: AdminAccess } | { kind: 'login' } | { kind: 'redirect'; to: string };

/** Pure decision helper (unit-tested): may this access open the admin pathname? */
export function decidePageAccess(access: AdminAccess | null, pathname: string): PageAccessDecision {
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
  const access = claims ? await resolveAdminAccess(claims.username, claims.role) : null;
  const decision = decidePageAccess(access, pathname);
  if (decision.kind === 'login') redirect(loginUrl);
  if (decision.kind === 'redirect') redirect(decision.to);
  return decision.access;
}
