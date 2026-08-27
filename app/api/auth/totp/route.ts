import { NextRequest, NextResponse } from 'next/server';
import QRCode from 'qrcode';
import { getSession, verifyPassword } from '@/lib/auth';
import {
  deleteAdminTotpSecret,
  readAdminTotpRecord,
  writeAdminTotpSecret,
} from '@/lib/admin-totp';
import { assertAdminIp } from '@/lib/require-admin-ip';
import { clientKey, rateLimit } from '@/lib/rate-limit';
import {
  buildOtpauthUrl,
  generateTotpSecret,
  getTotpSecret,
  getTotpStatus,
  isValidTotpSecret,
  normalizeTotpSecret,
  verifyTotp,
} from '@/lib/totp';

export const dynamic = 'force-dynamic';

async function requireAdminSession() {
  const ipGate = await assertAdminIp();
  if (!ipGate.ok) {
    return { ok: false as const, response: NextResponse.json({ error: ipGate.error }, { status: ipGate.status }) };
  }
  const isAuthenticated = await getSession();
  if (!isAuthenticated) {
    return { ok: false as const, response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }
  return { ok: true as const };
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

  if (!process.env.ADMIN_PASSWORD) {
    return NextResponse.json({ error: 'ADMIN_PASSWORD is not set' }, { status: 503 });
  }
  if (!verifyPassword(password)) {
    return NextResponse.json({ error: 'Invalid password' }, { status: 401 });
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
