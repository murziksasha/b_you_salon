import { NextResponse } from 'next/server';
import { verifySensitiveReauth } from '@/lib/admin/reauth';
import {
  createAdminUser,
  deleteAdminUser,
  listAdminUsers,
  setUserTotp,
  updateAdminUser,
} from '@/lib/admin-users';
import { revokeSessionsByUsername } from '@/lib/admin-sessions';
import { safeAudit } from '@/lib/api/audit';
import { apiError, withAdmin } from '@/lib/api/handler';
import type { AdminAccess } from '@/lib/require-role';
import { CreateUserSchema, DeleteUserSchema, UpdateUserSchema, reAuthPassword } from '@/lib/schemas/admin';

export const dynamic = 'force-dynamic';

const reAuthFailed = () => apiError(403, 'reauth_failed', 'Невірний пароль або код 2FA');

function reauth(
  access: Pick<AdminAccess, 'username' | 'role'>,
  body: { confirmPassword?: string; ownerPassword?: string; totp?: string },
) {
  return verifySensitiveReauth(access, { password: reAuthPassword(body), totp: body.totp });
}

export const GET = withAdmin('users', null, async () => {
  const users = await listAdminUsers();
  return NextResponse.json({ users });
});

export const POST = withAdmin('users', CreateUserSchema, async ({ access, body }) => {
  if (!(await reauth(access, body))) return reAuthFailed();
  const result = await createAdminUser({
    username: body.username,
    password: body.password,
    role: body.role ?? 'operator',
    grants: body.grants,
  });
  if ('error' in result) return apiError(400, 'invalid', result.error);
  await safeAudit({
    kind: 'security',
    message: `Створено користувача ${result.username} (${result.role})`,
    actor: access.username,
  });
  return NextResponse.json({ ok: true, user: result });
});

export const PATCH = withAdmin('users', UpdateUserSchema, async ({ access, body }) => {
  if (!(await reauth(access, body))) return reAuthFailed();
  if (body.resetTotp) {
    const target = (await listAdminUsers()).find((u) => u.id === body.id);
    if (!target) return apiError(404, 'not_found', 'Not found');
    await setUserTotp(target.username, null);
    await revokeSessionsByUsername(target.username).catch((err) => console.error('[users] revoke failed', err));
    await safeAudit({ kind: 'security', message: `Скинуто 2FA: ${target.username}`, actor: access.username });
  }
  const result = await updateAdminUser(body.id, {
    role: body.role,
    disabled: body.disabled,
    password: body.password,
    grants: body.grants,
  });
  if ('error' in result) {
    return apiError(result.error === 'Not found' ? 404 : 400, 'invalid', result.error);
  }
  await safeAudit({ kind: 'security', message: `Оновлено користувача ${body.id}`, actor: access.username });
  return NextResponse.json({ ok: true });
});

export const DELETE = withAdmin('users', DeleteUserSchema, async ({ access, body }) => {
  if (!(await reauth(access, body))) return reAuthFailed();
  const result = await deleteAdminUser(body.id);
  if ('error' in result) {
    return apiError(result.error === 'Not found' ? 404 : 400, 'invalid', result.error);
  }
  await safeAudit({ kind: 'security', message: `Видалено користувача ${body.id}`, actor: access.username });
  return NextResponse.json({ ok: true });
});
