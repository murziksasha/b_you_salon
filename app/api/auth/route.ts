import { NextRequest, NextResponse } from 'next/server';
import { authenticateLogin, createSession, destroySession, getSessionClaims, getSessionFingerprint } from '@/lib/auth';
import { appendActivity } from '@/lib/admin-activity';
import { lockoutRetryAfterSec, recordLoginFailure, resetLoginFailures } from '@/lib/login-lockout';
import { hasMultiUserMode } from '@/lib/admin-users';
import { isBreakglassActive } from '@/lib/admin/env-login';
import { sendTelegramMessage } from '@/lib/notify';
import { safeAudit } from '@/lib/api/audit';
import { markFingerprintRevoked, registerSession } from '@/lib/admin-sessions';
import { assertAdminIp } from '@/lib/require-admin-ip';
import { clientKey, rateLimit } from '@/lib/rate-limit';
import { getTotpSecret, verifyTotp } from '@/lib/totp';
import { decideTotpRequirement } from '@/lib/totp-login';
import { clientIpFromHeaders } from '@/lib/admin-ip';
import { parseSession } from '@/lib/session';
import { resolveAdminAccess } from '@/lib/require-role';

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

    const isBreakglass = Boolean(auth.viaEnvPassword && isBreakglassActive());
    const globalTotp = await getTotpSecret();
    const totpDecision = decideTotpRequirement({
      requireTotp: process.env.ADMIN_REQUIRE_TOTP === 'true',
      userTotpSecret: auth.userTotpSecret,
      globalTotpSecret: globalTotp?.secret,
      isBreakglass,
    });

    if (totpDecision.status === 'rejected_missing_personal') {
      return NextResponse.json(
        { error: totpDecision.error, code: totpDecision.code },
        { status: 401 },
      );
    }

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
    } catch (err) {
      console.error('[auth] session registration / audit failed', err);
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
  return NextResponse.json({
    ok: true,
    user: { username: access.username, role: access.role, grants: access.grants },
  });
}

export async function DELETE(_request: NextRequest) {
  try {
    const claims = await getSessionClaims();
    const fp = await getSessionFingerprint();
    if (fp) {
      try {
        await markFingerprintRevoked(fp);
      } catch (err) {
        console.error('[auth] failed to revoke session fingerprint', err);
      }
    }
    if (claims) {
      await safeAudit({
        kind: 'logout',
        message: `Вихід: ${claims.username}`,
        actor: claims.username,
      });
    }
  } catch {
    /* ignore */
  }
  await destroySession();
  return NextResponse.json({ ok: true });
}
