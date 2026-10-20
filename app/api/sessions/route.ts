import { NextResponse } from 'next/server';
import { getSessionFingerprint } from '@/lib/auth';
import { verifySensitiveReauth } from '@/lib/admin/reauth';
import { apiError, withAdmin } from '@/lib/api/handler';
import { RevokeSessionsSchema, reAuthPassword } from '@/lib/schemas/admin';
import { requireAdminRole } from '@/lib/require-role';
import {
  listSessions,
  markFingerprintRevoked,
  revokeAllSessions,
  revokeSession,
} from '@/lib/admin-sessions';
import { safeAudit } from '@/lib/api/audit';

export const dynamic = 'force-dynamic';

export async function GET() {
  const g = await requireAdminRole('security_owner');
  if (!g.ok) return g.response;
  const sessions = await listSessions();
  const current = await getSessionFingerprint();
  return NextResponse.json({ sessions, currentFingerprint: current });
}

export const DELETE = withAdmin('security_owner', RevokeSessionsSchema, async ({ access, body }) => {
  if (!(await verifySensitiveReauth(access, { password: reAuthPassword(body), totp: body.totp }))) {
    return apiError(403, 'reauth_failed', 'Невірний пароль або код 2FA');
  }
  if (body.all) {
    const current = await getSessionFingerprint();
    const n = await revokeAllSessions(current || undefined);
    await safeAudit({ kind: 'security', message: `Відкликано сесії (${n})`, actor: access.username });
    return NextResponse.json({ ok: true, revoked: n });
  }
  if (!body.id) return apiError(400, 'invalid', 'Missing id');
  const sessions = await listSessions();
  const target = sessions.find((s) => s.id === body.id);
  if (target) await markFingerprintRevoked(target.fingerprint);
  const ok = await revokeSession(body.id);
  if (!ok && !target) return apiError(404, 'not_found', 'Not found');
  return NextResponse.json({ ok: true });
});
