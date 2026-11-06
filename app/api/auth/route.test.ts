import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/require-admin-ip', () => ({
  assertAdminIp: vi.fn(async () => ({ ok: true })),
}));

vi.mock('@/lib/rate-limit', () => ({
  clientKey: vi.fn(() => 'test-client'),
  rateLimit: vi.fn(() => ({ allowed: true, retryAfterMs: 0 })),
  rateLimitAdaptive: vi.fn(() => ({ allowed: true, retryAfterMs: 0 })),
}));

vi.mock('@/lib/login-lockout', () => ({
  lockoutRetryAfterSec: vi.fn(() => 0),
  recordLoginFailure: vi.fn(() => false),
  resetLoginFailures: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({
  authenticateLogin: vi.fn(),
  createSession: vi.fn(async () => 'fake-session-token'),
  setSessionCookie: vi.fn(async () => {}),
  destroySession: vi.fn(),
  getSessionClaims: vi.fn(),
  getSessionFingerprint: vi.fn(),
}));

vi.mock('@/lib/totp', () => ({
  getTotpSecret: vi.fn(),
  verifyTotp: vi.fn(),
  verifyTotpWithStep: vi.fn(() => ({ ok: true, step: 100 })),
  hashRecoveryCode: vi.fn((c: string) => `hashed_${c}`),
}));

vi.mock('@/lib/admin-sessions', () => ({
  registerSession: vi.fn(async () => {}),
  markFingerprintRevoked: vi.fn(async () => {}),
}));

vi.mock('@/lib/admin-activity', () => ({
  appendActivity: vi.fn(async () => {}),
}));

vi.mock('@/lib/admin-users', () => ({
  hasMultiUserMode: vi.fn(async () => true),
  getAdminUserByUsername: vi.fn(async () => null),
  consumeUserRecoveryCode: vi.fn(async () => false),
  recordUserTotpStep: vi.fn(async () => {}),
}));

vi.mock('@/lib/admin/env-login', () => ({
  isBreakglassActive: vi.fn(() => false),
}));

vi.mock('@/lib/notify', () => ({
  sendTelegramMessage: vi.fn(async () => {}),
}));

vi.mock('@/lib/api/audit', () => ({
  safeAudit: vi.fn(async () => {}),
}));

vi.mock('@/lib/admin/reauth', () => ({
  resolveActorTotpSecret: vi.fn(),
}));

vi.mock('@/lib/admin-ip', () => ({
  clientIpFromHeaders: vi.fn(() => '127.0.0.1'),
}));

import { authenticateLogin, destroySession, getSessionFingerprint } from '@/lib/auth';
import { getTotpSecret, verifyTotpWithStep } from '@/lib/totp';
import { consumeUserRecoveryCode } from '@/lib/admin-users';
import { markFingerprintRevoked, registerSession } from '@/lib/admin-sessions';
import { DELETE, POST } from './route';

function post(body: Record<string, unknown>) {
  return new NextRequest('http://localhost:3000/api/auth', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/auth - personal TOTP enforcement', () => {
  const origEnv = process.env;

  beforeEach(() => {
    process.env = { ...origEnv, ADMIN_PASSWORD: 'password' };
    vi.clearAllMocks();
  });

  afterEach(() => {
    process.env = origEnv;
  });

  it('lets an editor in without TOTP when they have no personal secret', async () => {
    vi.mocked(authenticateLogin).mockResolvedValue({
      ok: true,
      claims: { username: 'user1', role: 'editor' },
    });
    vi.mocked(getTotpSecret).mockResolvedValue({ secret: 'GLOBAL_SECRET', source: 'env' });

    const res = await POST(post({ username: 'user1', password: 'password' }));
    expect(res.status).toBe(200);
    const json = (await res.json()) as { ok: boolean; totp: boolean; setupRequired?: boolean };
    expect(json.ok).toBe(true);
    expect(json.setupRequired).toBeUndefined();
    expect(verifyTotpWithStep).not.toHaveBeenCalled();
  });

  it('requires setup session for owner without personal secret', async () => {
    vi.mocked(authenticateLogin).mockResolvedValue({
      ok: true,
      claims: { username: 'owner_user', role: 'owner' },
    });

    const res = await POST(post({ username: 'owner_user', password: 'password' }));
    expect(res.status).toBe(200);
    const json = (await res.json()) as { ok: boolean; setupRequired?: boolean };
    expect(json.ok).toBe(true);
    expect(json.setupRequired).toBe(true);
  });

  it('verifies the personal secret for owner', async () => {
    vi.mocked(authenticateLogin).mockResolvedValue({
      ok: true,
      claims: { username: 'owner_user', role: 'owner' },
      userTotpSecret: 'PERSONAL_SECRET',
    });
    vi.mocked(verifyTotpWithStep).mockReturnValue({ ok: true, step: 123 });

    const res = await POST(post({ username: 'owner_user', password: 'password', totp: '123456' }));
    expect(res.status).toBe(200);
    const json = (await res.json()) as { ok: boolean; totp: boolean };
    expect(json.ok).toBe(true);
    expect(verifyTotpWithStep).toHaveBeenCalledWith('PERSONAL_SECRET', '123456', undefined);
  });

  it('allows owner to log in via recoveryCode', async () => {
    vi.mocked(authenticateLogin).mockResolvedValue({
      ok: true,
      claims: { username: 'owner_user', role: 'owner' },
      userTotpSecret: 'PERSONAL_SECRET',
    });
    vi.mocked(consumeUserRecoveryCode).mockResolvedValue(true);

    const res = await POST(post({ username: 'owner_user', password: 'password', recoveryCode: 'valid-recovery' }));
    expect(res.status).toBe(200);
    const json = (await res.json()) as { ok: boolean };
    expect(json.ok).toBe(true);
    expect(consumeUserRecoveryCode).toHaveBeenCalled();
  });

  it('fails login if registerSession fails', async () => {
    vi.mocked(authenticateLogin).mockResolvedValue({
      ok: true,
      claims: { username: 'user1', role: 'editor' },
    });
    vi.mocked(registerSession).mockRejectedValueOnce(new Error('disk error'));

    const res = await POST(post({ username: 'user1', password: 'password' }));
    expect(res.status).toBe(500);
  });

  it('requires global code for env login when global secret exists', async () => {
    vi.mocked(authenticateLogin).mockResolvedValue({
      ok: true,
      claims: { username: 'admin', role: 'owner' },
      viaEnvPassword: true,
    });
    vi.mocked(getTotpSecret).mockResolvedValue({ secret: 'GLOBAL_SECRET', source: 'env' });
    vi.mocked(verifyTotpWithStep).mockReturnValue({ ok: true, step: 200 });
    const ok = await POST(post({ username: 'admin', password: 'password', totp: '654321' }));
    expect(ok.status).toBe(200);
    expect(verifyTotpWithStep).toHaveBeenCalledWith('GLOBAL_SECRET', '654321', undefined);
  });

  it('returns setup_required for env login when no global secret is configured', async () => {
    vi.mocked(authenticateLogin).mockResolvedValue({
      ok: true,
      claims: { username: 'admin', role: 'owner' },
      viaEnvPassword: true,
    });
    vi.mocked(getTotpSecret).mockResolvedValue(null);

    const res = await POST(post({ username: 'admin', password: 'password' }));
    expect(res.status).toBe(200);
    const json = (await res.json()) as { ok: boolean; setupRequired?: boolean };
    expect(json.ok).toBe(true);
    expect(json.setupRequired).toBe(true);
  });
});

describe('DELETE /api/auth - logout revocation reliability', () => {
  it('returns 500 when fingerprint revocation fails and aborts session destruction', async () => {
    vi.mocked(getSessionFingerprint).mockResolvedValue('test-fingerprint-999');
    vi.mocked(markFingerprintRevoked).mockRejectedValue(new Error('Disk write failed'));

    const req = new NextRequest('http://localhost:3000/api/auth', { method: 'DELETE' });
    const res = await DELETE(req);

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe('Failed to revoke session');
    expect(destroySession).not.toHaveBeenCalled();
  });

  it('revokes fingerprint and clears session on successful logout', async () => {
    vi.mocked(getSessionFingerprint).mockResolvedValue('test-fingerprint-999');
    vi.mocked(markFingerprintRevoked).mockResolvedValue(undefined);

    const req = new NextRequest('http://localhost:3000/api/auth', { method: 'DELETE' });
    const res = await DELETE(req);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(markFingerprintRevoked).toHaveBeenCalledWith('test-fingerprint-999');
    expect(destroySession).toHaveBeenCalled();
  });
});
