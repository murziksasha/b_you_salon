import { NextResponse } from 'next/server';
import { verifyCurrentUserPassword } from '@/lib/admin/reauth';
import { createAdminUser, deleteAdminUser, listAdminUsers, updateAdminUser } from '@/lib/admin-users';
import { safeAudit } from '@/lib/api/audit';
import { apiError, withAdmin } from '@/lib/api/handler';
import { CreateUserSchema, DeleteUserSchema, UpdateUserSchema, reAuthPassword } from '@/lib/schemas/admin';

export const dynamic = 'force-dynamic';

const reAuthFailed = () => apiError(403, 'reauth_failed', 'Потрібен ваш пароль');

export const GET = withAdmin('users', null, async () => {
  const users = await listAdminUsers();
  return NextResponse.json({ users });
});

export const POST = withAdmin('users', CreateUserSchema, async ({ access, body }) => {
  if (!await verifyCurrentUserPassword(access, reAuthPassword(body))) return reAuthFailed();
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
  if (!await verifyCurrentUserPassword(access, reAuthPassword(body))) return reAuthFailed();
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
  if (!await verifyCurrentUserPassword(access, reAuthPassword(body))) return reAuthFailed();
  const result = await deleteAdminUser(body.id);
  if ('error' in result) {
    return apiError(result.error === 'Not found' ? 404 : 400, 'invalid', result.error);
  }
  await safeAudit({ kind: 'security', message: `Видалено користувача ${body.id}`, actor: access.username });
  return NextResponse.json({ ok: true });
});
