import { createHmac, randomBytes, timingSafeEqual } from 'crypto';
import { readAdminTotpRecord } from './admin-totp';

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export type TotpSource = 'env' | 'file';

export interface TotpStatus {
  enabled: boolean;
  /** Where the active secret comes from when enabled. */
  source: TotpSource | null;
  /** Env secret present — UI cannot enable/disable file-based 2FA. */
  managedByEnv: boolean;
  /** File secret exists (even if env overrides it for login). */
  fileConfigured: boolean;
  enabledAt: string | null;
}

/** Base32 decode (RFC 4648), ignores spaces/padding. */
function base32Decode(input: string): Buffer {
  const cleaned = input.replace(/=+$/g, '').replace(/\s+/g, '').toUpperCase();
  let bits = '';
  for (const c of cleaned) {
    const val = BASE32_ALPHABET.indexOf(c);
    if (val < 0) continue;
    bits += val.toString(2).padStart(5, '0');
  }
  const bytes: number[] = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) {
    bytes.push(parseInt(bits.slice(i, i + 8), 2));
  }
  return Buffer.from(bytes);
}

/** Base32 encode without padding (Authenticator-friendly). */
export function base32Encode(buf: Buffer): string {
  let bits = '';
  for (const byte of buf) {
    bits += byte.toString(2).padStart(8, '0');
  }
  let out = '';
  for (let i = 0; i + 5 <= bits.length; i += 5) {
    out += BASE32_ALPHABET[parseInt(bits.slice(i, i + 5), 2)];
  }
  const rem = bits.length % 5;
  if (rem) {
    out += BASE32_ALPHABET[parseInt(bits.slice(-rem).padEnd(5, '0'), 2)];
  }
  return out;
}

function hotp(secret: Buffer, counter: number, digits = 6): string {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(counter));
  const hmac = createHmac('sha1', secret).update(buf).digest();
  const offset = hmac[hmac.length - 1] & 0xf;
  const code =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);
  const str = (code % 10 ** digits).toString().padStart(digits, '0');
  return str;
}

/** Normalize base32 secret: upper, strip spaces. */
export function normalizeTotpSecret(secret: string): string {
  return String(secret || '')
    .replace(/=+$/g, '')
    .replace(/\s+/g, '')
    .toUpperCase();
}

/** Valid TOTP secret: base32, at least 16 chars (~80 bits). */
export function isValidTotpSecret(secret: string): boolean {
  const cleaned = normalizeTotpSecret(secret);
  if (cleaned.length < 16) return false;
  return /^[A-Z2-7]+$/.test(cleaned);
}

/** Generate a new 160-bit (20-byte) base32 TOTP secret. */
export function generateTotpSecret(): string {
  return base32Encode(randomBytes(20));
}

export function buildOtpauthUrl(
  secretBase32: string,
  options?: { account?: string; issuer?: string },
): string {
  const issuer = options?.issuer || 'ProperService';
  const account = options?.account || 'admin';
  const label = encodeURIComponent(`${issuer}:${account}`);
  const params = new URLSearchParams({
    secret: normalizeTotpSecret(secretBase32),
    issuer,
    algorithm: 'SHA1',
    digits: '6',
    period: '30',
  });
  return `otpauth://totp/${label}?${params.toString()}`;
}

/** Verify TOTP code (30s step, ±1 window). */
export function verifyTotp(secretBase32: string, token: string, window = 1): boolean {
  const secret = base32Decode(secretBase32);
  if (!secret.length) return false;
  const clean = String(token || '').replace(/\s+/g, '');
  if (!/^\d{6}$/.test(clean)) return false;
  const step = Math.floor(Date.now() / 1000 / 30);
  for (let w = -window; w <= window; w++) {
    const expected = hotp(secret, step + w);
    try {
      if (timingSafeEqual(Buffer.from(expected), Buffer.from(clean))) return true;
    } catch {
      // length mismatch
    }
  }
  return false;
}

/**
 * Active secret for login verification.
 * Priority: `ADMIN_TOTP_SECRET` env → `data/admin-totp.json`.
 */
export async function getTotpSecret(): Promise<{ secret: string; source: TotpSource } | null> {
  const fromEnv = process.env.ADMIN_TOTP_SECRET?.trim();
  if (fromEnv) {
    return { secret: normalizeTotpSecret(fromEnv), source: 'env' };
  }
  const file = await readAdminTotpRecord();
  if (file?.secret) {
    return { secret: normalizeTotpSecret(file.secret), source: 'file' };
  }
  return null;
}

export async function totpEnabled(): Promise<boolean> {
  return Boolean(await getTotpSecret());
}

export async function getTotpStatus(): Promise<TotpStatus> {
  const envSecret = Boolean(process.env.ADMIN_TOTP_SECRET?.trim());
  const file = await readAdminTotpRecord();
  const fileConfigured = Boolean(file?.secret);

  if (envSecret) {
    return {
      enabled: true,
      source: 'env',
      managedByEnv: true,
      fileConfigured,
      enabledAt: null,
    };
  }
  if (fileConfigured) {
    return {
      enabled: true,
      source: 'file',
      managedByEnv: false,
      fileConfigured: true,
      enabledAt: file?.enabledAt || null,
    };
  }
  return {
    enabled: false,
    source: null,
    managedByEnv: false,
    fileConfigured: false,
    enabledAt: null,
  };
}
