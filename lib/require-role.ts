import { NextResponse } from 'next/server';
import { getSession, getSessionClaims } from './auth';
import { assertAdminIp } from './require-admin-ip';
import {
  capabilitiesFor,
  isAdminRole,
  roleCan,
  type AdminCapability,
  type AdminRole,
} from './admin-roles';
import { getAdminUserByUsername, hasMultiUserMode } from './admin-users';
import { isEnvLoginAllowed } from './admin/env-login';
import type { SessionClaims } from './session';

export type AdminAccess = {
  role: AdminRole | 'legacy';
  username: string;
  grants: AdminCapability[];
};

export type RoleGate =
  | ({ ok: true } & AdminAccess)
  | { ok: false; response: NextResponse };

export async function resolveAdminAccess(
  claimsOrUsername: SessionClaims | string | null | undefined,
  cookieRole?: string,
): Promise<AdminAccess | null> {
  if (!claimsOrUsername) return null;
  const isClaims = typeof claimsOrUsername === 'object';
  const username = isClaims ? claimsOrUsername.username : claimsOrUsername;
  const roleInCookie = isClaims ? claimsOrRole(claimsOrUsername, cookieRole) : cookieRole;
  const authVersion = isClaims ? claimsOrUsername.authVersion : undefined;
  const accountType = isClaims ? claimsOrUsername.accountType : undefined;
  const setupOnly = isClaims ? claimsOrUsername.setupOnly : false;

  if (!username) return null;
  if (setupOnly) return null;

  const multi = await hasMultiUserMode();
  if (multi) {
    const user = await getAdminUserByUsername(username);
    if (user) {
      if (user.disabled) return null;
      // Invalidate old sessions when authVersion changed
      if (authVersion !== undefined && user.authVersion !== undefined && authVersion !== user.authVersion) {
        return null;
      }
      return {
        username: user.username,
        role: user.role,
        grants: [...capabilitiesFor(user.role, user.grants)],
      };
    }
    // Only env "admin" identity may fall back, and only if accountType is 'env' (or when called with legacy string username)
    if (
      (accountType === 'env' || (!isClaims && accountType === undefined)) &&
      username === 'admin' &&
      (roleInCookie === 'owner' || roleInCookie === 'legacy') &&
      (await isEnvLoginAllowed())
    ) {
      return {
        username: 'admin',
        role: roleInCookie,
        grants: [...capabilitiesFor(roleInCookie)],
      };
    }
    return null;
  }

  // Single-user env mode
  const role: AdminRole | 'legacy' = isAdminRole(roleInCookie)
    ? roleInCookie
    : roleInCookie === 'legacy'
      ? 'legacy'
      : 'legacy';
  return {
    username: username || 'admin',
    role,
    grants: [...capabilitiesFor(role)],
  };
}

function claimsOrRole(claims: SessionClaims, fallback?: string): string | undefined {
  return claims.role || fallback;
}

/**
 * Auth + IP + optional capability check for admin APIs.
 * `action` maps to roleCan() keys (see AdminCapability); `stats` aliases dashboard_view.
 * Authorization uses the live user row, not the session cookie role.
 */
export async function requireAdminRole(
  action?: string,
  options?: { allowSetupOnly?: boolean },
): Promise<RoleGate> {
  const ipGate = await assertAdminIp();
  if (!ipGate.ok) {
    return {
      ok: false,
      response: NextResponse.json({ error: ipGate.error }, { status: ipGate.status }),
    };
  }
  if (!(await getSession())) {
    return { ok: false, response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }
  const claims = await getSessionClaims();
  if (!claims || !claims.username) {
    return { ok: false, response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }
  if (claims.setupOnly && !options?.allowSetupOnly) {
    return {
      ok: false,
      response: NextResponse.json({ error: '2FA setup required', setupRequired: true }, { status: 403 }),
    };
  }

  const access = await resolveAdminAccess(claims);
  if (!access) {
    return { ok: false, response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }
  if (action && !roleCan(access.role, action, access.grants)) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'Forbidden', needRole: action }, { status: 403 }),
    };
  }
  return { ok: true, ...access };
}
