import { NextRequest, NextResponse } from 'next/server';
import { getSession, getSessionClaims, verifyPassword } from '@/lib/auth';
import { assertAdminIp } from '@/lib/require-admin-ip';
import {
  createAdminUser,
  deleteAdminUser,
  listAdminUsers,
  updateAdminUser,
  type AdminRole,
} from '@/lib/admin-users';
import { appendActivity } from '@/lib/admin-activity';

export const dynamic = 'force-dynamic';

async function requireOwner() {
  const ipGate = await assertAdminIp();
  if (!ipGate.ok) {
    return { ok: false as const, response: NextResponse.json({ error: ipGate.error }, { status: ipGate.status }) };
  }
  if (!(await getSession())) {
    return { ok: false as const, response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }
  const claims = await getSessionClaims();
  const role = claims?.role || 'legacy';
  if (role !== 'owner' && role !== 'legacy') {
    return { ok: false as const, response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  }
  return { ok: true as const, claims };
}

export async function GET() {
  const g = await requireOwner();
  if (!g.ok) return g.response;
  const users = await listAdminUsers();
  return NextResponse.json({ users });
}

export async function POST(request: NextRequest) {
  const g = await requireOwner();
  if (!g.ok) return g.response;

  try {
    const body = (await request.json()) as {
      username?: string;
      password?: string;
      role?: AdminRole;
      ownerPassword?: string;
    };
    // Step-up: re-enter owner password
    if (!verifyPassword(body.ownerPassword || '')) {
      return NextResponse.json({ error: 'Потрібен пароль власника' }, { status: 403 });
    }
    const role = body.role === 'editor' || body.role === 'operator' || body.role === 'owner' ? body.role : 'operator';
    const result = await createAdminUser({
      username: body.username || '',
      password: body.password || '',
      role,
    });
    if ('error' in result) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }
    try {
      await appendActivity({
        kind: 'security',
        message: `Створено користувача ${result.username} (${result.role})`,
        actor: g.claims?.username,
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
  const g = await requireOwner();
  if (!g.ok) return g.response;
  try {
    const body = (await request.json()) as {
      id?: string;
      role?: AdminRole;
      disabled?: boolean;
      password?: string;
      ownerPassword?: string;
    };
    if (!verifyPassword(body.ownerPassword || '')) {
      return NextResponse.json({ error: 'Потрібен пароль власника' }, { status: 403 });
    }
    if (!body.id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });
    const ok = await updateAdminUser(body.id, {
      role: body.role,
      disabled: body.disabled,
      password: body.password,
    });
    if (!ok) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: 'Bad request' }, { status: 400 });
  }
}

export async function DELETE(request: NextRequest) {
  const g = await requireOwner();
  if (!g.ok) return g.response;
  try {
    const body = (await request.json()) as { id?: string; ownerPassword?: string };
    if (!verifyPassword(body.ownerPassword || '')) {
      return NextResponse.json({ error: 'Потрібен пароль власника' }, { status: 403 });
    }
    if (!body.id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });
    const ok = await deleteAdminUser(body.id);
    if (!ok) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: 'Bad request' }, { status: 400 });
  }
}
