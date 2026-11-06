import { defineConfig, devices } from '@playwright/test';
import path from 'path';

const PORT = process.env.PLAYWRIGHT_PORT || '3002';
const rawBaseURL = process.env.PLAYWRIGHT_BASE_URL || `http://127.0.0.1:${PORT}`;

// Fail closed: reject external or non-loopback URLs for smoke write tests
try {
  const parsed = new URL(rawBaseURL);
  const host = parsed.hostname.toLowerCase();
  if (host !== '127.0.0.1' && host !== 'localhost') {
    throw new Error(
      `[Playwright Security Guard] Write suites must target a local loopback server. Rejected external target: ${rawBaseURL}`,
    );
  }
  const parsedPort = parsed.port || (parsed.protocol === 'https:' ? '443' : '80');
  if (parsedPort === '3001' && process.env.ALLOW_PROD_PORT_TEST !== 'true') {
    throw new Error(
      `[Playwright Security Guard] Refusing to target port 3001 (production port). Use an isolated test server port (e.g. 3002).`,
    );
  }
} catch (err: unknown) {
  throw new Error(`[Playwright Security Guard] Invalid baseURL: ${String(err)}`);
}

const e2eDataDir = path.resolve(process.cwd(), '.data-e2e');
const e2eUploadsDir = path.resolve(process.cwd(), '.uploads-e2e');

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  timeout: 120_000,
  expect: {
    timeout: 20_000,
  },
  use: {
    baseURL: rawBaseURL,
    trace: 'on-first-retry',
    ...devices['Desktop Chrome'],
  },
  webServer: process.env.PLAYWRIGHT_SKIP_WEBSERVER
    ? undefined
    : {
        command: `npx next dev -H 127.0.0.1 -p ${PORT}`,
        url: `${rawBaseURL}/api/health`,
        reuseExistingServer: false,
        timeout: 120_000,
        env: {
          ...process.env,
          PORT,
          // Fixed isolated test-only journals and media directories (never production)
          DATA_DIR: e2eDataDir,
          UPLOADS_DIR: e2eUploadsDir,
          // Strip outbound external credentials
          TELEGRAM_BOT_TOKEN: '',
          TELEGRAM_CHAT_ID: '',
          SMTP_HOST: '',
          SMTP_USER: '',
          SMTP_PASS: '',
          SMTP_FROM: '',
          PLAYWRIGHT_TEST: 'true',
          SMOKE_TEST: 'true',
          ADMIN_IP_ALLOWLIST: '',
          ADMIN_PASSWORD: 'e2e-test-password-deterministic',
          ADMIN_TOTP_SECRET: process.env.ADMIN_TOTP_SECRET || 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP',
          SESSION_SECRET: 'e2e-session-secret-at-least-32-chars-long-deterministic',
          COOKIE_SECURE: 'false',
          ADMIN_ENV_LOGIN: 'always',
          TRUST_PROXY: 'false',
          ADMIN_CSRF_CHECK: 'false',
        },
      },
});
