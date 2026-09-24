import { NextRequest, NextResponse } from 'next/server';
import { getSessionClaims, getSessionFingerprint, verifyPassword } from '@/lib/auth';
import { requireAdminRole } from '@/lib/require-role';
import {
  listSessions,
  markFingerprintRevoked,
  revokeAllSessions,
  revokeSession,
} from '@/lib/admin-sessions';
import { appendActivity } from '@/lib/admin-activity';

export const dynamic = 'force-dynamic';

export async function GET() {
  const g = await requireAdminRole('security_owner');
  if (!g.ok) return g.response;
  const sessions = await listSessions();
  const current = await getSessionFingerprint();
  return NextResponse.json({ sessions, currentFingerprint: current });
}

export async function DELETE(request: NextRequest) {
  const g = await requireAdminRole('security_owner');
  if (!g.ok) return g.response;
  const claims = await getSessionClaims();

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
