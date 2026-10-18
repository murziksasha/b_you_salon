import { afterEach, describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { isPublicApi, middleware } from './middleware';

function req(path: string, init: { method?: string; headers?: Record<string, string> } = {}) {
  return new NextRequest(new URL(path, 'http://site.test'), {
    method: init.method || 'GET',
    headers: { host: 'site.test', ...(init.headers || {}) },
  });
}

describe('middleware', () => {
  afterEach(() => {
    delete process.env.ADMIN_IP_ALLOWLIST;
    delete process.env.TRUST_PROXY;
    delete process.env.BACKUP_CRON_SECRET;
  });

  it('classifies public API by method', () => {
    expect(isPublicApi('/api/health', 'GET')).toBe(true);
    expect(isPublicApi('/api/orders', 'POST')).toBe(true);
    expect(isPublicApi('/api/orders', 'GET')).toBe(false);
    expect(isPublicApi('/api/import-feed', 'POST')).toBe(false);
    expect(isPublicApi('/api/telegram/webhook', 'POST')).toBe(true);
    expect(isPublicApi('/api/brand-new-route', 'GET')).toBe(false);
  });

  it('blocks state-changing admin API without same origin', () => {
    expect(middleware(req('/api/site', { method: 'PUT' })).status).toBe(403);
    expect(middleware(req('/api/site', { method: 'PUT', headers: { origin: 'http://evil.test' } })).status).toBe(403);
    expect(middleware(req('/api/site', { method: 'PUT', headers: { origin: 'http://site.test' } })).status).toBe(200);
  });

  it('ignores port differences between Origin and Host (nginx $host)', () => {
    expect(middleware(req('/api/site', { method: 'PATCH', headers: { origin: 'http://site.test:8080' } })).status).toBe(
      200,
    );
  });

  it('does not origin-check public POSTs or GETs', () => {
    expect(middleware(req('/api/contact', { method: 'POST' })).status).toBe(200);
    expect(middleware(req('/api/site')).status).toBe(200);
  });

  it('applies IP allowlist to new routes by default but not to public ones', () => {
    process.env.ADMIN_IP_ALLOWLIST = '10.0.0.1';
    process.env.TRUST_PROXY = 'true';
    const h = { 'x-real-ip': '10.9.9.9' };
    expect(middleware(req('/api/import-feed', { headers: h })).status).toBe(403);
    expect(middleware(req('/api/orders', { method: 'POST', headers: h })).status).toBe(200);
  });

  it('lets authorized backup cron through without origin', () => {
    process.env.BACKUP_CRON_SECRET = 's3cret';
    expect(middleware(req('/api/backup', { method: 'POST', headers: { authorization: 'Bearer s3cret' } })).status).toBe(
      200,
    );
  });

  it('redirects admin UI without session cookie', () => {
    expect(middleware(req('/admin/goods')).status).toBe(307);
  });
});
