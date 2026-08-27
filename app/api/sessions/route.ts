import { NextRequest, NextResponse } from 'next/server';
import { getSession, getSessionClaims, getSessionFingerprint, verifyPassword } from '@/lib/auth';
import { assertAdminIp } from '@/lib/require-admin-ip';
import {
  listSessions,
  markFingerprintRevoked,
  revokeAllSessions,
  revokeSession,
} from '@/lib/admin-sessions';
import { appendActivity } from '@/lib/admin-activity';

export const dynamic = 'force-dynamic';

async function guard() {
  const ipGate = await assertAdminIp();
  if (!ipGate.ok) {
    return { ok: false as const, response: NextResponse.json({ error: ipGate.error }, { status: ipGate.status }) };
  }
  if (!(await getSession())) {
    return { ok: false as const, response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }
  return { ok: true as const };
}

export async function GET() {
  const g = await guard();
  if (!g.ok) return g.response;
  const claims = await getSessionClaims();
  const role = claims?.role || 'legacy';
  if (role !== 'owner' && role !== 'legacy') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const sessions = await listSessions();
  const current = await getSessionFingerprint();
  return NextResponse.json({ sessions, currentFingerprint: current });
}

export async function DELETE(request: NextRequest) {
  const g = await guard();
  if (!g.ok) return g.response;
  const claims = await getSessionClaims();
  const role = claims?.role || 'legacy';
  if (role !== 'owner' && role !== 'legacy') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const body = (await request.json()) as {
      id?: string;
      all?: boolean;
      ownerPassword?: string;
    };
    if (!verifyPassword(body.ownerPassword || '')) {
      return NextResponse.json({ error: 'Потрібен пароль власника' }, { status: 403 });
    }
    if (body.all) {
      const current = await getSessionFingerprint();
      const n = await revokeAllSessions(current || undefined);
      try {
        await appendActivity({
          kind: 'security',
          message: `Відкликано сесії (${n})`,
          actor: claims?.username,
        });
      } catch {
        /* ignore */
      }
      return NextResponse.json({ ok: true, revoked: n });
    }
    if (!body.id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });
    const sessions = await listSessions();
    const target = sessions.find((s) => s.id === body.id);
    if (target) await markFingerprintRevoked(target.fingerprint);
    const ok = await revokeSession(body.id);
    if (!ok && !target) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: 'Bad request' }, { status: 400 });
  }
}
