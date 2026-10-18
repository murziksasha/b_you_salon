import { verifyPassword } from '@/lib/auth';
import { getAdminUserByUsername, verifyPasswordHash } from '@/lib/admin-users';
import type { AdminAccess } from '@/lib/require-role';

/**
 * Step-up re-authentication with the CURRENT user's own password.
 * - Users from admins.json: their scrypt hash.
 * - Env identity ("admin" without a row in admins.json, or legacy role): ADMIN_PASSWORD.
 * Knowing ADMIN_PASSWORD no longer lets another user confirm sensitive actions.
 */
export async function verifyCurrentUserPassword(
  access: Pick<AdminAccess, 'username' | 'role'>,
  password: string,
): Promise<boolean> {
  if (!password) return false;
  const user = await getAdminUserByUsername(access.username);
  if (user) return verifyPasswordHash(password, user.passwordHash);
  if (access.role === 'legacy' || access.username === 'admin') return verifyPassword(password);
  return false;
}
