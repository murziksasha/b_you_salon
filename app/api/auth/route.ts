import { NextRequest, NextResponse } from 'next/server';
import {
  authenticateLogin,
  createSession,
  destroySession,
  getSessionClaims,
  getSessionFingerprint,
} from '@/lib/auth';
import { appendActivity } from '@/lib/admin-activity';
import { markFingerprintRevoked, registerSession } from '@/lib/admin-sessions';
import { assertAdminIp } from '@/lib/require-admin-ip';
import { clientKey, rateLimit } from '@/lib/rate-limit';
import { getTotpSecret, verifyTotp } from '@/lib/totp';
import { clientIpFromHeaders } from '@/lib/admin-ip';
import { parseSession } from '@/lib/session';

export async function POST(request: NextRequest) {
  const ipGate = await assertAdminIp();
  if (!ipGate.ok) {
    return NextResponse.json({ error: ipGate.error }, { status: ipGate.status });
  }

  const rl = rateLimit(clientKey(request, 'auth'), { limit: 10, windowMs: 60_000 });
  if (!rl.allowed) {
    const retryAfter = Math.ceil(rl.retryAfterMs / 1000) || 60;
    return NextResponse.json(
      { error: 'Too many attempts', retryAfter },
      { status: 429, headers: { 'Retry-After': String(retryAfter) } },
    );
  }

  try {
    const body = await request.json();
    const password = typeof body.password === 'string' ? body.password : '';
    const username = typeof body.username === 'string' ? body.username : '';
    const totp = typeof body.totp === 'string' ? body.totp : '';

    if (!process.env.ADMIN_PASSWORD) {
      return NextResponse.json(
        { error: 'ADMIN_PASSWORD is not set in .env' },
        { status: 503 },
      );
    }

    const auth = await authenticateLogin({ password, username });
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: 401 });
    }

    const totpActive = await getTotpSecret();
    if (totpActive) {
      if (!verifyTotp(totpActive.secret, totp)) {
        return NextResponse.json({ error: 'Invalid 2FA code', needTotp: true }, { status: 401 });
      }
    }

    const sessionToken = await createSession(auth.claims);

    // Register session for revoke-all / list (best-effort)
    try {
      const parsed = await parseSession(sessionToken);
      const fp = parsed.fingerprint || sessionToken.slice(0, 16);
      await registerSession({
        fingerprint: fp,
        username: auth.claims.username,
        role: auth.claims.role,
        userAgent: request.headers.get('user-agent') || undefined,
        ip: clientIpFromHeaders(request.headers) || undefined,
      });
      await appendActivity({
        kind: 'login',
        message: `Вхід: ${auth.claims.username}`,
        actor: auth.claims.username,
      });
    } catch {
      /* ignore activity errors */
    }

    return NextResponse.json({
      ok: true,
      totp: Boolean(totpActive),
      user: auth.claims,
    });
  } catch {
    return NextResponse.json({ error: 'Bad request' }, { status: 400 });
  }
}

export async function GET() {
  const claims = await getSessionClaims();
  if (!claims) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  return NextResponse.json({ ok: true, user: claims });
}

export async function DELETE(request: NextRequest) {
  try {
    const claims = await getSessionClaims();
    const fp = await getSessionFingerprint();
    if (fp) {
      try {
        await markFingerprintRevoked(fp);
      } catch {
        /* ignore */
      }
    }
    if (claims) {
      try {
        await appendActivity({
          kind: 'logout',
          message: `Вихід: ${claims.username}`,
          actor: claims.username,
        });
      } catch {
        /* ignore */
      }
    }
  } catch {
    /* ignore */
  }
  await destroySession();
  return NextResponse.json({ ok: true });
}
