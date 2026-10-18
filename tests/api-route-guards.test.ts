import { readdirSync, readFileSync, statSync } from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';

/**
 * Guard coverage: every app/api route must either use an admin gate (requireAdminRole /
 * withAdmin / requireAdminOrCron) or be explicitly listed here with a justification.
 * Adding a new route without a gate fails CI.
 */
const UNGATED_ALLOWLIST: Record<string, string> = {
  'auth/route.ts': 'login/logout itself (IP gate + rate limit + lockout)',
  'contact/route.ts': 'public callback form (honeypot + rate limit)',
  'cookie-consent/route.ts': 'public cookie banner',
  'health/route.ts': 'public minimal health; full report checks session inside',
  'telegram/webhook/route.ts': 'Telegram webhook (secret header)',
};

function listRoutes(dir: string, base = dir): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return listRoutes(full, base);
    return name === 'route.ts' ? [path.relative(base, full).split(path.sep).join('/')] : [];
  });
}

describe('API route guards', () => {
  const apiDir = path.join(process.cwd(), 'app', 'api');
  const routes = listRoutes(apiDir);

  it('finds routes', () => {
    expect(routes.length).toBeGreaterThan(20);
  });

  it.each(routes)('%s is gated or explicitly allowlisted', (rel) => {
    const src = readFileSync(path.join(apiDir, rel), 'utf-8');
    const gated = /requireAdminRole|withAdmin|requireAdminOrCron/.test(src);
    expect(gated || rel in UNGATED_ALLOWLIST).toBe(true);
  });

  it('allowlist has no stale entries', () => {
    for (const rel of Object.keys(UNGATED_ALLOWLIST)) expect(routes).toContain(rel);
  });
});
