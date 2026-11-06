import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/require-role', () => ({
  requireAdminRole: vi.fn(async () => ({ ok: true, role: 'owner', grants: [] })),
}));

vi.mock('@/lib/rate-limit', () => ({
  clientKey: vi.fn(() => 'test-key'),
  rateLimit: vi.fn(() => ({ allowed: true, retryAfterMs: 0 })),
}));

let mockSite = {
  settings: { description: 'test' },
  pages: [],
  goods: [],
  services: [],
  updatedAt: '2026-11-04T10:00:00.000Z',
};

vi.mock('@/lib/site-data', () => ({
  getSiteData: vi.fn(async () => ({ ...mockSite })),
  saveSiteData: vi.fn(async (data) => {
    mockSite = { ...data, updatedAt: '2026-11-04T10:05:00.000Z' };
    return mockSite;
  }),
  withSiteDataLock: vi.fn(async (fn) => fn()),
}));

vi.mock('@/lib/validation', () => ({
  parseSiteData: vi.fn((data) => ({ success: true, data })),
}));

import { PUT } from './route';

describe('PUT /api/site optimistic locking', () => {
  beforeEach(() => {
    mockSite = {
      settings: { description: 'test' },
      pages: [],
      goods: [],
      services: [],
      updatedAt: '2026-11-04T10:00:00.000Z',
    };
  });

  it('rejects stale revision with 409 conflict', async () => {
    const req = new NextRequest('http://localhost:3000/api/site', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ...mockSite, updatedAt: '2026-11-04T09:00:00.000Z' }),
    });

    const res = await PUT(req);
    expect(res.status).toBe(409);
    const json = await res.json();
    expect(json.code).toBe('CONFLICT');
  });

  it('accepts matching revision and saves', async () => {
    const req = new NextRequest('http://localhost:3000/api/site', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ...mockSite, updatedAt: '2026-11-04T10:00:00.000Z' }),
    });

    const res = await PUT(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.updatedAt).toBe('2026-11-04T10:05:00.000Z');
  });

  it('allows overwrite when x-force-overwrite header is present', async () => {
    const req = new NextRequest('http://localhost:3000/api/site', {
      method: 'PUT',
      headers: {
        'content-type': 'application/json',
        'x-force-overwrite': '1',
      },
      body: JSON.stringify({ ...mockSite, updatedAt: '2026-11-04T08:00:00.000Z' }),
    });

    const res = await PUT(req);
    expect(res.status).toBe(200);
  });
});

