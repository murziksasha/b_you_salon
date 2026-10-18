import { NextRequest, NextResponse } from 'next/server';
import QRCode from 'qrcode';
import { verifyCurrentUserPassword } from '@/lib/admin/reauth';
import { requireAdminRole } from '@/lib/require-role';
import { roleCan } from '@/lib/admin-roles';
import { getAdminUserByUsername, setUserTotp, type AdminUser } from '@/lib/admin-users';
import { safeAudit } from '@/lib/api/audit';
import {
  deleteAdminTotpSecret,
  readAdminTotpRecord,
  writeAdminTotpSecret,
} from '@/lib/admin-totp';
import { clientKey, rateLimit } from '@/lib/rate-limit';
import {
  buildOtpauthUrl,
  generateTotpSecret,
  getTotpSecret,
  getTotpStatus,
  isValidTotpSecret,
  normalizeTotpSecret,
  verifyTotp,
  type TotpStatus,
} from '@/lib/totp';

export const dynamic = 'force-dynamic';

/**
 * Any authenticated admin may manage their OWN personal 2FA (admins.json users).
 * The global (env/file) secret used by the env "admin" identity requires security_owner.
 */
async function requireAdminSession() {
  const gate = await requireAdminRole();
  if (!gate.ok) return { ok: false as const, response: gate.response };
  const { ok: _ok, ...access } = gate;
  return { ok: true as const, access };
}

function rateLimitTotp(request: NextRequest) {
  const rl = rateLimit(clientKey(request, 'totp-setup'), { limit: 20, windowMs: 60_000 });
  if (!rl.allowed) {
    const retryAfter = Math.ceil(rl.retryAfterMs / 1000) || 60;
    return NextResponse.json(
      { error: 'Too many attempts', retryAfter },
      { status: 429, headers: { 'Retry-After': String(retryAfter) } },
    );
  }
  return null;
}

/** GET — 2FA status (no secret). Session required. */
export async function GET() {
  const gate = await requireAdminSession();
  if (!gate.ok) return gate.response;

  const dbUser = await getAdminUserByUsername(gate.access.username);
  if (dbUser) {
    const personal: TotpStatus = {
      enabled: Boolean(dbUser.totp?.secret),
      source: dbUser.totp?.secret ? 'file' : null,
      managedByEnv: false,
      fileConfigured: Boolean(dbUser.totp?.secret),
      enabledAt: dbUser.totp?.enabledAt || null,
    };
    return NextResponse.json({ ...personal, scope: 'user' }, { headers: { 'Cache-Control': 'no-store' } });
  }
  if (!roleCan(gate.access.role, 'security_owner', gate.access.grants)) {
    return NextResponse.json({ error: 'Forbidden', needRole: 'security_owner' }, { status: 403 });
  }

  const status = await getTotpStatus();
  return NextResponse.json(status, { headers: { 'Cache-Control': 'no-store' } });
}

/**
 * POST actions:
 * - begin: generate secret + QR (not persisted; password required)
 * - confirm: persist secret after TOTP proof (password + secret + code)
 * - disable: remove file secret (password + current code)
 */
export async function POST(request: NextRequest) {
  const gate = await requireAdminSession();
  if (!gate.ok) return gate.response;

  const limited = rateLimitTotp(request);
  if (limited) return limited;

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'Bad request' }, { status: 400 });
  }

  const action = typeof body.action === 'string' ? body.action : '';
  const password = typeof body.password === 'string' ? body.password : '';

  if (!(await verifyCurrentUserPassword(gate.access, password))) {
    return NextResponse.json({ error: 'Invalid password' }, { status: 401 });
  }

  const dbUser = await getAdminUserByUsername(gate.access.username);
  if (dbUser) return personalTotpAction(dbUser, action, body);
  if (!roleCan(gate.access.role, 'security_owner', gate.access.grants)) {
    return NextResponse.json({ error: 'Forbidden', needRole: 'security_owner' }, { status: 403 });
  }

  if (action === 'begin') {
    const status = await getTotpStatus();
    if (status.managedByEnv) {
      return NextResponse.json(
        {
          error:
            '2FA already managed by ADMIN_TOTP_SECRET in .env — remove it to use admin UI setup',
        },
        { status: 400 },
      );
    }
    if (status.enabled && status.source === 'file') {
      return NextResponse.json(
        { error: '2FA already enabled — disable it first to reconfigure' },
        { status: 400 },
      );
    }

    const secret = generateTotpSecret();
    const otpauthUrl = buildOtpauthUrl(secret);
    let qrDataUrl = '';
    try {
      qrDataUrl = await QRCode.toDataURL(otpauthUrl, {
        errorCorrectionLevel: 'M',
        margin: 2,
        width: 220,
        color: { dark: '#111111', light: '#ffffff' },
      });
    } catch (err) {
      console.error('[totp] QR generation failed', err);
      return NextResponse.json({ error: 'QR generation failed' }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      secret,
      otpauthUrl,
      qrDataUrl,
      hint: 'Scan the QR or enter the secret manually, then confirm with a 6-digit code.',
    });
  }

  if (action === 'confirm') {
    const status = await getTotpStatus();
    if (status.managedByEnv) {
      return NextResponse.json(
        { error: '2FA is managed by ADMIN_TOTP_SECRET in .env' },
        { status: 400 },
      );
    }
    if (status.enabled && status.source === 'file') {
      return NextResponse.json({ error: '2FA already enabled' }, { status: 400 });
    }

    const secretRaw = typeof body.secret === 'string' ? body.secret : '';
    const code = typeof body.code === 'string' ? body.code : '';
    const secret = normalizeTotpSecret(secretRaw);

    if (!isValidTotpSecret(secret)) {
      return NextResponse.json({ error: 'Invalid secret' }, { status: 400 });
    }
    if (!verifyTotp(secret, code)) {
      return NextResponse.json({ error: 'Invalid 2FA code' }, { status: 401 });
    }

    const record = await writeAdminTotpSecret(secret);
    return NextResponse.json({
      ok: true,
      enabled: true,
      source: 'file',
      enabledAt: record.enabledAt,
    });
  }

  if (action === 'disable') {
    const status = await getTotpStatus();
    if (status.managedByEnv) {
      return NextResponse.json(
        {
          error:
            '2FA is set via ADMIN_TOTP_SECRET in .env — remove the variable and restart to disable',
        },
        { status: 400 },
      );
    }
    if (!status.enabled) {
      // Idempotent: clear stray file if any
      await deleteAdminTotpSecret();
      return NextResponse.json({ ok: true, enabled: false });
    }

    const code = typeof body.code === 'string' ? body.code : '';
    const active = await getTotpSecret();
    if (!active || !verifyTotp(active.secret, code)) {
      return NextResponse.json({ error: 'Invalid 2FA code' }, { status: 401 });
    }

    await deleteAdminTotpSecret();
    // If a file somehow remains with bad data, re-check
    const left = await readAdminTotpRecord();
    if (left?.secret) {
      return NextResponse.json({ error: 'Failed to remove 2FA config' }, { status: 500 });
    }

    return NextResponse.json({ ok: true, enabled: false });
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
}

/** Personal 2FA for admins.json users (stored in admins.json, never returned by list APIs). */
async function personalTotpAction(user: AdminUser, action: string, body: Record<string, unknown>) {
  const code = typeof body.code === 'string' ? body.code : '';
  if (action === 'begin') {
    if (user.totp?.secret) {
      return NextResponse.json({ error: '2FA already enabled — disable it first to reconfigure' }, { status: 400 });
    }
    const secret = generateTotpSecret();
    const otpauthUrl = buildOtpauthUrl(secret, { account: user.username });
    let qrDataUrl = '';
    try {
      qrDataUrl = await QRCode.toDataURL(otpauthUrl, { errorCorrectionLevel: 'M', margin: 2, width: 220 });
    } catch (err) {
      console.error('[totp] QR generation failed', err);
      return NextResponse.json({ error: 'QR generation failed' }, { status: 500 });
    }
    return NextResponse.json({ ok: true, secret, otpauthUrl, qrDataUrl, scope: 'user' });
  }
  if (action === 'confirm') {
    if (user.totp?.secret) return NextResponse.json({ error: '2FA already enabled' }, { status: 400 });
    const secret = normalizeTotpSecret(typeof body.secret === 'string' ? body.secret : '');
    if (!isValidTotpSecret(secret)) return NextResponse.json({ error: 'Invalid secret' }, { status: 400 });
    if (!verifyTotp(secret, code)) return NextResponse.json({ error: 'Invalid 2FA code' }, { status: 401 });
    const res = await setUserTotp(user.username, secret);
    if ('error' in res) return NextResponse.json({ error: res.error }, { status: 400 });
    await safeAudit({ kind: 'security', message: `2FA увімкнено: ${user.username}`, actor: user.username });
    return NextResponse.json({ ok: true, enabled: true, source: 'file', scope: 'user' });
  }
  if (action === 'disable') {
    if (!user.totp?.secret) return NextResponse.json({ ok: true, enabled: false });
    if (!verifyTotp(user.totp.secret, code)) {
      return NextResponse.json({ error: 'Invalid 2FA code' }, { status: 401 });
    }
    await setUserTotp(user.username, null);
    await safeAudit({ kind: 'security', message: `2FA вимкнено: ${user.username}`, actor: user.username });
    return NextResponse.json({ ok: true, enabled: false });
  }
  return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
}
