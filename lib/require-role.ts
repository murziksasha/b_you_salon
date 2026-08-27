import { NextResponse } from 'next/server';
import { getSession, getSessionClaims } from './auth';
import { assertAdminIp } from './require-admin-ip';
import { roleCan, type AdminRole } from './admin-roles';

export type RoleGate =
  | { ok: true; role: AdminRole | 'legacy'; username: string }
  | { ok: false; response: NextResponse };

/**
 * Auth + IP + optional capability check for admin APIs.
 * `action` maps to roleCan() keys: inbox, leads, orders, content, media, settings,
 * users, security_owner, restore_backup, dashboard_view
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
  const role = (claims?.role || 'legacy') as AdminRole | 'legacy';
  const username = claims?.username || 'admin';
  if (action && !roleCan(role, action)) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'Forbidden', needRole: action }, { status: 403 }),
    };
  }
  return { ok: true, role, username };
}
