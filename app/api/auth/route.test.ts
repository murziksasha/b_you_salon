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

  it('rejects login with PERSONAL_TOTP_REQUIRED when ADMIN_REQUIRE_TOTP=true and user has no personal secret', async () => {
    process.env.ADMIN_REQUIRE_TOTP = 'true';
    vi.mocked(authenticateLogin).mockResolvedValue({
      ok: true,
      claims: { username: 'user1', role: 'editor' },
      userTotpSecret: undefined,
    });
    vi.mocked(getTotpSecret).mockResolvedValue({ secret: 'GLOBAL_SECRET', source: 'file' });

    const req = new NextRequest('http://localhost:3000/api/auth', {
      method: 'POST',
      body: JSON.stringify({ username: 'user1', password: 'password123' }),
    });

    const res = await POST(req);
    expect(res.status).toBe(401);
    const json = (await res.json()) as { code: string; error: string };
    expect(json.code).toBe('PERSONAL_TOTP_REQUIRED');
    expect(json.error).toBe('Personal TOTP required');
  });

  it('verifies personal secret when ADMIN_REQUIRE_TOTP=true and user has personal secret', async () => {
    process.env.ADMIN_REQUIRE_TOTP = 'true';
    vi.mocked(authenticateLogin).mockResolvedValue({
      ok: true,
      claims: { username: 'owner_user', role: 'owner' },
      userTotpSecret: 'PERSONAL_SECRET_123',
    });
    vi.mocked(verifyTotp).mockReturnValue(true);

    const req = new NextRequest('http://localhost:3000/api/auth', {
      method: 'POST',
      body: JSON.stringify({ username: 'owner_user', password: 'password123', totp: '123456' }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    const json = (await res.json()) as { ok: boolean; totp: boolean };
    expect(json.ok).toBe(true);
    expect(json.totp).toBe(true);
    expect(verifyTotp).toHaveBeenCalledWith('PERSONAL_SECRET_123', '123456');
  });

  it('allows break-glass through when ADMIN_REQUIRE_TOTP=true', async () => {
    process.env.ADMIN_REQUIRE_TOTP = 'true';
    vi.mocked(authenticateLogin).mockResolvedValue({
      ok: true,
      claims: { username: 'admin', role: 'owner' },
      viaEnvPassword: true,
    });
    vi.mocked(isBreakglassActive).mockReturnValue(true);
    vi.mocked(getTotpSecret).mockResolvedValue(null);

    const req = new NextRequest('http://localhost:3000/api/auth', {
      method: 'POST',
      body: JSON.stringify({ username: 'admin', password: 'password123' }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    const json = (await res.json()) as { ok: boolean };
    expect(json.ok).toBe(true);
  });
});

