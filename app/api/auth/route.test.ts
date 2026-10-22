import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/require-admin-ip', () => ({
  assertAdminIp: vi.fn(async () => ({ ok: true })),
}));

vi.mock('@/lib/rate-limit', () => ({
  clientKey: vi.fn(() => 'test-client'),
  rateLimit: vi.fn(() => ({ allowed: true, retryAfterMs: 0 })),
}));

vi.mock('@/lib/login-lockout', () => ({
  lockoutRetryAfterSec: vi.fn(() => 0),
  recordLoginFailure: vi.fn(() => false),
  resetLoginFailures: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({
  authenticateLogin: vi.fn(),
  createSession: vi.fn(async () => 'fake-session-token'),
  destroySession: vi.fn(),
  getSessionClaims: vi.fn(),
  getSessionFingerprint: vi.fn(),
}));

vi.mock('@/lib/totp', () => ({
  getTotpSecret: vi.fn(),
  verifyTotp: vi.fn(),
}));

vi.mock('@/lib/admin-sessions', () => ({
  registerSession: vi.fn(async () => {}),
  markFingerprintRevoked: vi.fn(async () => {}),
}));

vi.mock('@/lib/admin-activity', () => ({
  appendActivity: vi.fn(async () => {}),
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

import { authenticateLogin } from '@/lib/auth';
import { getTotpSecret, verifyTotp } from '@/lib/totp';
import { isBreakglassActive } from '@/lib/admin/env-login';
import { POST } from './route';

describe('POST /api/auth - personal TOTP enforcement', () => {
  beforeEach(() => {
    process.env.ADMIN_PASSWORD = 'password123';
  });

  afterEach(() => {
    delete process.env.ADMIN_REQUIRE_TOTP;
    delete process.env.ADMIN_PASSWORD;
    vi.clearAllMocks();
  });

  function post(body: unknown) {
    return new NextRequest('http://localhost:3000/api/auth', {
      method: 'POST',
      body: JSON.stringify(body),
    });
  }

  it('lets a file user in without TOTP when only the global secret exists', async () => {
    process.env.ADMIN_REQUIRE_TOTP = 'true';
    vi.mocked(authenticateLogin).mockResolvedValue({
      ok: true,
      claims: { username: 'user1', role: 'editor' },
      userTotpSecret: undefined,
    });
    vi.mocked(getTotpSecret).mockResolvedValue({ secret: 'GLOBAL_SECRET', source: 'file' });

    const res = await POST(post({ username: 'user1', password: 'password123' }));
    expect(res.status).toBe(200);
    expect(getTotpSecret).not.toHaveBeenCalled();
    expect(verifyTotp).not.toHaveBeenCalled();
  });

  it('verifies the personal secret and ignores the global one', async () => {
    vi.mocked(authenticateLogin).mockResolvedValue({
      ok: true,
      claims: { username: 'owner_user', role: 'owner' },
      userTotpSecret: 'PERSONAL_SECRET_123',
    });
    vi.mocked(getTotpSecret).mockResolvedValue({ secret: 'GLOBAL_SECRET', source: 'env' });
    vi.mocked(verifyTotp).mockReturnValue(true);

    const res = await POST(post({ username: 'owner_user', password: 'password123', totp: '123456' }));
    expect(res.status).toBe(200);
    const json = (await res.json()) as { ok: boolean; totp: boolean };
    expect(json.ok).toBe(true);
    expect(json.totp).toBe(true);
    expect(verifyTotp).toHaveBeenCalledWith('PERSONAL_SECRET_123', '123456');
    expect(getTotpSecret).not.toHaveBeenCalled();
  });

  it('requires the global code for env login when that secret exists', async () => {
    vi.mocked(authenticateLogin).mockResolvedValue({
      ok: true,
      claims: { username: 'admin', role: 'owner' },
      viaEnvPassword: true,
    });
    vi.mocked(isBreakglassActive).mockReturnValue(false);
    vi.mocked(getTotpSecret).mockResolvedValue({ secret: 'GLOBAL_SECRET', source: 'env' });
    vi.mocked(verifyTotp).mockReturnValue(false);

    const missing = await POST(post({ username: 'admin', password: 'password123' }));
    expect(missing.status).toBe(401);
    expect(((await missing.json()) as { needTotp: boolean }).needTotp).toBe(true);

    vi.mocked(verifyTotp).mockReturnValue(true);
    const ok = await POST(post({ username: 'admin', password: 'password123', totp: '654321' }));
    expect(ok.status).toBe(200);
    expect(verifyTotp).toHaveBeenCalledWith('GLOBAL_SECRET', '654321');
  });

  it('allows env login without a code when no global secret is configured', async () => {
    vi.mocked(authenticateLogin).mockResolvedValue({
      ok: true,
      claims: { username: 'admin', role: 'owner' },
      viaEnvPassword: true,
    });
    vi.mocked(isBreakglassActive).mockReturnValue(true);
    vi.mocked(getTotpSecret).mockResolvedValue(null);

    const res = await POST(post({ username: 'admin', password: 'password123' }));
    expect(res.status).toBe(200);
    expect(verifyTotp).not.toHaveBeenCalled();
  });
});

