import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { createHmac, randomBytes } from 'crypto';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import {
  base32Encode,
  buildOtpauthUrl,
  generateTotpSecret,
  getTotpSecret,
  getTotpStatus,
  isValidTotpSecret,
  normalizeTotpSecret,
  verifyTotp,
} from './totp';
import { deleteAdminTotpSecret, writeAdminTotpSecret } from './admin-totp';

function hotp(secretB32: string, counter: number): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const cleaned = secretB32.replace(/=+$/g, '').replace(/\s+/g, '').toUpperCase();
  let bits = '';
  for (const c of cleaned) {
    const val = alphabet.indexOf(c);
    if (val < 0) continue;
    bits += val.toString(2).padStart(5, '0');
  }
  const bytes: number[] = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) {
    bytes.push(parseInt(bits.slice(i, i + 8), 2));
  }
  const secret = Buffer.from(bytes);
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(counter));
  const hmac = createHmac('sha1', secret).update(buf).digest();
  const offset = hmac[hmac.length - 1] & 0xf;
  const code =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);
  return (code % 1_000_000).toString().padStart(6, '0');
}

describe('totp', () => {
  it('accepts current window code', () => {
    const secret = 'JBSWY3DPEHPK3PXP';
    const step = Math.floor(Date.now() / 1000 / 30);
    const code = hotp(secret, step);
    expect(verifyTotp(secret, code)).toBe(true);
  });

  it('rejects bad code', () => {
    expect(verifyTotp('JBSWY3DPEHPK3PXP', '000000')).toBe(false);
    expect(verifyTotp('JBSWY3DPEHPK3PXP', 'abc')).toBe(false);
  });

  it('generates valid secrets and otpauth URLs', () => {
    const secret = generateTotpSecret();
    expect(isValidTotpSecret(secret)).toBe(true);
    expect(secret.length).toBeGreaterThanOrEqual(16);
    const url = buildOtpauthUrl(secret);
    expect(url.startsWith('otpauth://totp/')).toBe(true);
    expect(url).toContain(`secret=${secret}`);
    expect(url).toContain('issuer=ProperService');
  });

  it('base32 encode/decode roundtrip via verify', () => {
    const raw = randomBytes(20);
    const b32 = base32Encode(raw);
    const step = Math.floor(Date.now() / 1000 / 30);
    const code = hotp(b32, step);
    expect(verifyTotp(b32, code)).toBe(true);
  });

  it('normalizes secrets', () => {
    expect(normalizeTotpSecret(' jbsw y3dp ')).toBe('JBSWY3DP');
  });
});

describe('totp secret resolution', () => {
  let tmpDir: string;
  let prevDataDir: string | undefined;
  let prevEnvSecret: string | undefined;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'totp-'));
    prevDataDir = process.env.DATA_DIR;
    prevEnvSecret = process.env.ADMIN_TOTP_SECRET;
    process.env.DATA_DIR = tmpDir;
    delete process.env.ADMIN_TOTP_SECRET;
  });

  afterEach(async () => {
    if (prevDataDir === undefined) delete process.env.DATA_DIR;
    else process.env.DATA_DIR = prevDataDir;
    if (prevEnvSecret === undefined) delete process.env.ADMIN_TOTP_SECRET;
    else process.env.ADMIN_TOTP_SECRET = prevEnvSecret;
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('returns null when neither env nor file', async () => {
    expect(await getTotpSecret()).toBeNull();
    const status = await getTotpStatus();
    expect(status.enabled).toBe(false);
    expect(status.source).toBeNull();
  });

  it('uses file secret when no env', async () => {
    const secret = 'JBSWY3DPEHPK3PXP';
    await writeAdminTotpSecret(secret);
    const active = await getTotpSecret();
    expect(active?.source).toBe('file');
    expect(active?.secret).toBe(secret);
    const status = await getTotpStatus();
    expect(status.enabled).toBe(true);
    expect(status.source).toBe('file');
    expect(status.managedByEnv).toBe(false);
  });

  it('env overrides file', async () => {
    await writeAdminTotpSecret('JBSWY3DPEHPK3PXP');
    process.env.ADMIN_TOTP_SECRET = 'MFRGGZDFMZTWQ2LK';
    const active = await getTotpSecret();
    expect(active?.source).toBe('env');
    expect(active?.secret).toBe('MFRGGZDFMZTWQ2LK');
    const status = await getTotpStatus();
    expect(status.managedByEnv).toBe(true);
    expect(status.fileConfigured).toBe(true);
  });

  it('delete removes file secret', async () => {
    await writeAdminTotpSecret('JBSWY3DPEHPK3PXP');
    await deleteAdminTotpSecret();
    expect(await getTotpSecret()).toBeNull();
  });
});
