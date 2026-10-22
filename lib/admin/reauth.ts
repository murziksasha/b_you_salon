import { verifyPassword } from '@/lib/auth';
import { getAdminUserByUsername, verifyPasswordHash } from '@/lib/admin-users';
import { getTotpSecret, verifyTotp } from '@/lib/totp';
import type { AdminAccess } from '@/lib/require-role';

type Actor = Pick<AdminAccess, 'username' | 'role'>;

/**
 * Step-up re-authentication with the CURRENT user's own password.
 * - Users from admins.json: their scrypt hash.
 * - Env identity ("admin" without a row in admins.json, or legacy role): ADMIN_PASSWORD.
 * Knowing ADMIN_PASSWORD no longer lets another user confirm sensitive actions.
 */
export async function verifyCurrentUserPassword(access: Actor, password: string): Promise<boolean> {
  if (!password) return false;
  const user = await getAdminUserByUsername(access.username);
  if (user) return verifyPasswordHash(password, user.passwordHash);
  if (access.role === 'legacy' || access.username === 'admin') return verifyPassword(password);
  return false;
}

/**
 * Secret that this actor must present at login and on sensitive actions.
 * A file user never receives the global secret. Env login never receives a file user's secret.
 */
export async function resolveActorTotpSecret(
  access: Actor,
): Promise<{ secret: string; source: 'user' | 'global' } | null> {
  const user = await getAdminUserByUsername(access.username);
  if (user) {
    return user.totp?.secret ? { secret: user.totp.secret, source: 'user' } : null;
  }
  if (access.role === 'legacy' || access.username === 'admin') {
    const global = await getTotpSecret();
    return global ? { secret: global.secret, source: 'global' } : null;
  }
  return null;
}

/** Password always. TOTP only when this actor has a secret. No short-lived remember. */
export async function verifySensitiveReauth(
  access: Actor,
  input: { password: string; totp?: string },
): Promise<boolean> {
  if (!(await verifyCurrentUserPassword(access, input.password))) return false;
  const factor = await resolveActorTotpSecret(access);
  if (!factor) return true;
  return verifyTotp(factor.secret, input.totp || '');
}
