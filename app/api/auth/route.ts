import { NextRequest, NextResponse } from 'next/server';
import {
  authenticateLogin,
  destroySession,
  getSessionClaims,
  getSessionFingerprint,
  setSessionCookie,
} from '@/lib/auth';
import { appendActivity } from '@/lib/admin-activity';
import { lockoutRetryAfterSec, recordLoginFailure, resetLoginFailures } from '@/lib/login-lockout';
import { hasMultiUserMode } from '@/lib/admin-users';
import { isBreakglassActive } from '@/lib/admin/env-login';
import { sendTelegramMessage } from '@/lib/notify';
import { safeAudit } from '@/lib/api/audit';
import { markFingerprintRevoked, registerSession } from '@/lib/admin-sessions';
import { assertAdminIp } from '@/lib/require-admin-ip';
import { rateLimit, rateLimitAdaptive } from '@/lib/rate-limit';
import { getTotpSecret, verifyTotp } from '@/lib/totp';
import { resolveActorTotpSecret } from '@/lib/admin/reauth';
import { decideTotpRequirement } from '@/lib/totp-login';
import { clientIpFromHeaders } from '@/lib/admin-ip';
import { createSessionToken, parseSession } from '@/lib/session';
import { resolveAdminAccess } from '@/lib/require-role';

export async function POST(request: NextRequest) {
  const ipGate = await assertAdminIp();
  if (!ipGate.ok) {
    return NextResponse.json({ error: ipGate.error }, { status: ipGate.status });
  }

  const rl = rateLimitAdaptive(request, 'auth', {
    clientLimit: 10,
    globalCeiling: 100,
    windowMs: 60_000,
  });
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

    if (username.trim()) {
      const userKey = `auth:user:${username.trim().toLowerCase()}`;
      const userRl = rateLimit(userKey, { limit: 5, windowMs: 60_000 });
      if (!userRl.allowed) {
        const retryAfter = Math.ceil(userRl.retryAfterMs / 1000) || 60;
        return NextResponse.json(
          { error: 'Too many attempts for this user', retryAfter },
          { status: 429, headers: { 'Retry-After': String(retryAfter) } },
        );
      }
    }

    if (!process.env.ADMIN_PASSWORD && !(await hasMultiUserMode())) {
      return NextResponse.json({ error: 'ADMIN_PASSWORD is not set in .env' }, { status: 503 });
    }

    const lockedFor = lockoutRetryAfterSec(username);
    if (lockedFor > 0) {
      return NextResponse.json(
        { error: 'Too many attempts', retryAfter: lockedFor },
        { status: 429, headers: { 'Retry-After': String(lockedFor) } },
      );
    }

    const auth = await authenticateLogin({ password, username });
    if (!auth.ok) {
      if (recordLoginFailure(username)) {
        await safeAudit({
          kind: 'security',
          message: `Блокування входу: ${username || 'admin'} (5 невдалих спроб)`,
          actor: username || 'admin',
        });
        void sendTelegramMessage(
          `⚠️ B_You: 5 невдалих входів для «${username || 'admin'}», вхід заблоковано на 15 хв`,
        ).catch(err => console.error('[auth] lockout alert failed', err));
      }
      return NextResponse.json({ error: auth.error }, { status: 401 });
    }

    const identity = auth.viaEnvPassword ? 'env' : 'file';
    const globalTotp = identity === 'env' ? await getTotpSecret() : null;
    const totpDecision = decideTotpRequirement({
      identity,
      personalSecret: auth.userTotpSecret,
      globalSecret: globalTotp?.secret,
    });

    if (totpDecision.status === 'required') {
      if (!verifyTotp(totpDecision.secret, totp)) {
        if (totp) recordLoginFailure(username);
        return NextResponse.json({ error: 'Invalid 2FA code', needTotp: true }, { status: 401 });
      }
    }

    if (auth.viaEnvPassword && isBreakglassActive()) {
      await safeAudit({ kind: 'security', message: 'Break-glass вхід через ADMIN_PASSWORD', actor: 'admin' });
      void sendTelegramMessage('⚠️ B_You: break-glass вхід в адмінку через ADMIN_PASSWORD').catch(err =>
        console.error('[auth] break-glass alert failed', err),
      );
    }

    resetLoginFailures(username);
    const sessionToken = await createSessionToken(auth.claims);
    const parsed = await parseSession(sessionToken);
    const fp = parsed.fingerprint || sessionToken.slice(0, 16);

    // Register session into allowlist (MUST succeed before cookie is set)
    try {
      await registerSession({
        fingerprint: fp,
        username: auth.claims.username,
        role: auth.claims.role,
        userAgent: request.headers.get('user-agent') || undefined,
        ip: clientIpFromHeaders(request.headers) || undefined,
      });
      await setSessionCookie(sessionToken);
      await appendActivity({
        kind: 'login',
        message: `Вхід: ${auth.claims.username}`,
        actor: auth.claims.username,
      });
    } catch (err) {
      console.error('[auth] session registration / allowlist failed', err);
      return NextResponse.json({ error: 'Session registration failed' }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      totp: totpDecision.status === 'required',
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
  const access = await resolveAdminAccess(claims.username || 'admin', claims.role);
  if (!access) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  const factor = await resolveActorTotpSecret(access);
  return NextResponse.json({
    ok: true,
    totpEnabled: Boolean(factor),
    user: { username: access.username, role: access.role, grants: access.grants },
  });
}

export async function DELETE(_request: NextRequest) {
  let claims: { username: string } | null = null;
  let fp: string | null = null;
  try {
    claims = await getSessionClaims();
    fp = await getSessionFingerprint();
  } catch {
    /* ignore session read errors */
  }

  if (fp) {
    let revoked = false;
    let lastErr: unknown;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        await markFingerprintRevoked(fp);
        revoked = true;
        break;
      } catch (err) {
        lastErr = err;
        await new Promise((r) => setTimeout(r, 50));
      }
    }
    if (!revoked) {
      console.error('[auth] failed to revoke session fingerprint after retries:', lastErr);
      return NextResponse.json(
        { error: 'Failed to revoke session' },
        { status: 500 },
      );
    }
  }

  if (claims) {
    await safeAudit({
      kind: 'logout',
      message: `Вихід: ${claims.username}`,
      actor: claims.username,
    });
  }

  await destroySession();
  return NextResponse.json({ ok: true });
}
