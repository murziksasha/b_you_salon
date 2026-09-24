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

export type AdminAccess = {
  role: AdminRole | 'legacy';
  username: string;
  grants: AdminCapability[];
};

export type RoleGate =
  | ({ ok: true } & AdminAccess)
  | { ok: false; response: NextResponse };

export async function resolveAdminAccess(
  username: string,
  cookieRole?: string,
): Promise<AdminAccess | null> {
  const multi = await hasMultiUserMode();
  if (multi) {
    const user = await getAdminUserByUsername(username);
    if (user) {
      return {
        username: user.username,
        role: user.role,
        grants: [...capabilitiesFor(user.role, user.grants)],
      };
    }
    if (cookieRole === 'owner' || cookieRole === 'legacy') {
      return {
        username: username || 'admin',
        role: cookieRole,
        grants: [...capabilitiesFor(cookieRole)],
      };
    }
    return null;
  }
  const role: AdminRole | 'legacy' = isAdminRole(cookieRole)
    ? cookieRole
    : cookieRole === 'legacy'
      ? 'legacy'
      : 'legacy';
  return {
    username: username || 'admin',
    role,
    grants: [...capabilitiesFor(role)],
  };
}

/**
 * Auth + IP + optional capability check for admin APIs.
 * `action` maps to roleCan() keys (see AdminCapability); `stats` aliases dashboard_view.
 * Authorization uses the live user row, not the session cookie role.
 */
export async function requireAdminRole(action?: string): Promise<RoleGate> {
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
  const username = claims?.username || 'admin';
  const access = await resolveAdminAccess(username, claims?.role);
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
