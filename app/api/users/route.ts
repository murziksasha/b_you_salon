import { NextRequest, NextResponse } from 'next/server';
import { verifyPassword } from '@/lib/auth';
import {
  createAdminUser,
  deleteAdminUser,
  listAdminUsers,
  updateAdminUser,
  type AdminRole,
} from '@/lib/admin-users';
import { isAdminRole, type AdminCapability } from '@/lib/admin-roles';
import { appendActivity } from '@/lib/admin-activity';
import { requireAdminRole } from '@/lib/require-role';

export const dynamic = 'force-dynamic';

export async function GET() {
  const g = await requireAdminRole('users');
  if (!g.ok) return g.response;
  const users = await listAdminUsers();
  return NextResponse.json({ users });
}

export async function POST(request: NextRequest) {
  const g = await requireAdminRole('users');
  if (!g.ok) return g.response;

  try {
    const body = (await request.json()) as {
      username?: string;
      password?: string;
      role?: AdminRole;
      grants?: AdminCapability[];
      ownerPassword?: string;
    };
    if (!verifyPassword(body.ownerPassword || '')) {
      return NextResponse.json({ error: 'Потрібен пароль власника' }, { status: 403 });
    }
    const role = isAdminRole(body.role) ? body.role : 'operator';
    const result = await createAdminUser({
      username: body.username || '',
      password: body.password || '',
      role,
      grants: body.grants,
    });
    if ('error' in result) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }
    try {
      await appendActivity({
        kind: 'security',
        message: `Створено користувача ${result.username} (${result.role})`,
        actor: g.username,
      });
    } catch {
      /* ignore */
    }
    return NextResponse.json({ ok: true, user: result });
  } catch {
    return NextResponse.json({ error: 'Bad request' }, { status: 400 });
  }
}

export async function PATCH(request: NextRequest) {
  const g = await requireAdminRole('users');
  if (!g.ok) return g.response;
  try {
    const body = (await request.json()) as {
      id?: string;
      role?: AdminRole;
      disabled?: boolean;
      password?: string;
      grants?: AdminCapability[];
      ownerPassword?: string;
    };
    if (!verifyPassword(body.ownerPassword || '')) {
      return NextResponse.json({ error: 'Потрібен пароль власника' }, { status: 403 });
    }
    if (!body.id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });
    if (body.password !== undefined && body.password.length < 8) {
      return NextResponse.json({ error: 'Password must be ≥8 chars' }, { status: 400 });
    }
    const result = await updateAdminUser(body.id, {
      role: isAdminRole(body.role) ? body.role : undefined,
      disabled: body.disabled,
      password: body.password,
      grants: body.grants,
    });
    if ('error' in result) {
      const status = result.error === 'Not found' ? 404 : 400;
      return NextResponse.json({ error: result.error }, { status });
    }
    try {
      await appendActivity({
        kind: 'security',
        message: `Оновлено користувача ${body.id}`,
        actor: g.username,
      });
    } catch {
      /* ignore */
    }
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: 'Bad request' }, { status: 400 });
  }
}

export async function DELETE(request: NextRequest) {
  const g = await requireAdminRole('users');
  if (!g.ok) return g.response;
  try {
    const body = (await request.json()) as { id?: string; ownerPassword?: string };
    if (!verifyPassword(body.ownerPassword || '')) {
      return NextResponse.json({ error: 'Потрібен пароль власника' }, { status: 403 });
    }
    if (!body.id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });
    const result = await deleteAdminUser(body.id);
    if ('error' in result) {
      const status = result.error === 'Not found' ? 404 : 400;
      return NextResponse.json({ error: result.error }, { status });
    }
    try {
      await appendActivity({
        kind: 'security',
        message: `Видалено користувача ${body.id}`,
        actor: g.username,
      });
    } catch {
      /* ignore */
    }
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: 'Bad request' }, { status: 400 });
  }
}
