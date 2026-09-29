import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

vi.mock('@/lib/require-role', () => ({
  requireAdminRole: vi.fn(),
}));

vi.mock('@/lib/rate-limit', () => ({
  clientKey: vi.fn(() => 'test-ip'),
  rateLimit: vi.fn(),
}));

vi.mock('@/lib/site-data', () => ({
  getSiteData: vi.fn(),
  saveSiteData: vi.fn(),
}));

vi.mock('@/lib/fetch-remote-image', () => ({
  fetchAndStoreImage: vi.fn(),
}));

vi.mock('@/lib/admin-activity', () => ({
  appendActivity: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({
  getSessionClaims: vi.fn(),
}));

import { requireAdminRole } from '@/lib/require-role';
import { rateLimit } from '@/lib/rate-limit';
import { getSiteData, saveSiteData } from '@/lib/site-data';
import { fetchAndStoreImage } from '@/lib/fetch-remote-image';
import { appendActivity } from '@/lib/admin-activity';
import type { Product, SiteData } from '@/lib/types';
import { POST } from './route';

describe('POST /api/import-feed', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireAdminRole).mockResolvedValue({
      ok: true,
      username: 'admin',
      role: 'owner',
      grants: ['goods'],
    });
    vi.mocked(rateLimit).mockReturnValue({
      allowed: true,
      remaining: 2,
      retryAfterMs: 0,
    });
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('returns unauthorized response when user role is insufficient', async () => {
    vi.mocked(requireAdminRole).mockResolvedValue({
      ok: false,
      response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    });

    const req = new NextRequest('http://localhost/api/import-feed', {
      method: 'POST',
      body: JSON.stringify({ url: 'https://example.com/feed.json' }),
    });

    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it('returns 429 when rate limit is exceeded', async () => {
    vi.mocked(rateLimit).mockReturnValue({
      allowed: false,
      remaining: 0,
      retryAfterMs: 60000,
    });

    const req = new NextRequest('http://localhost/api/import-feed', {
      method: 'POST',
      body: JSON.stringify({ url: 'https://example.com/feed.json' }),
    });

    const res = await POST(req);
    expect(res.status).toBe(429);
    const data = await res.json();
    expect(data.error).toBe('Too many import requests');
  });

  it('returns 400 for invalid body or invalid url', async () => {
    const invalidJsonReq = new NextRequest('http://localhost/api/import-feed', {
      method: 'POST',
      body: 'invalid-json',
    });
    const res1 = await POST(invalidJsonReq);
    expect(res1.status).toBe(400);

    const invalidUrlReq = new NextRequest('http://localhost/api/import-feed', {
      method: 'POST',
      body: JSON.stringify({ url: 'ftp://not-supported' }),
    });
    const res2 = await POST(invalidUrlReq);
    expect(res2.status).toBe(400);
  });

  it('returns 502 if fetching feed fails', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
    } as unknown as Response);

    const req = new NextRequest('http://localhost/api/import-feed', {
      method: 'POST',
      body: JSON.stringify({ url: 'https://example.com/feed.json' }),
    });

    const res = await POST(req);
    expect(res.status).toBe(502);
  });

  it('returns 422 if feed contains no parseable products', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify({ products: [] }),
    } as unknown as Response);

    const req = new NextRequest('http://localhost/api/import-feed', {
      method: 'POST',
      body: JSON.stringify({ url: 'https://example.com/feed.json' }),
    });

    const res = await POST(req);
    expect(res.status).toBe(422);
    const data = await res.json();
    expect(data.error).toBe('Feed contains no parseable products');
  });

  it('successfully imports and updates products in catalog', async () => {
    const feedJson = {
      products: [
        {
          sku: 'EXISTING-1',
          name: 'Updated Name',
          description: 'New description',
          price: '200',
          price_red: '150',
          thumb: 'https://example.com/img.jpg',
        },
        {
          sku: 'NEW-1',
          name: 'New Product',
          description: 'Fresh item',
          price: '300',
          thumb: '',
        },
      ],
    };

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify(feedJson),
    } as unknown as Response);

    vi.mocked(fetchAndStoreImage).mockResolvedValue('/uploads/saved.webp');

    const existingProduct: Product = {
      id: 'prod-old',
      title: 'Old Name',
      description: 'Old description',
      code: 'EXISTING-1',
      price: 180,
      image: '/uploads/old.webp',
      images: [],
      category: 'cosmetics',
      visible: true,
      inStock: true,
      sortPin: true,
      relatedIds: ['prod-x'],
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    };

    vi.mocked(getSiteData).mockResolvedValue({
      goods: [existingProduct],
    } as unknown as SiteData);

    vi.mocked(saveSiteData).mockResolvedValue(undefined as never);

    const req = new NextRequest('http://localhost/api/import-feed', {
      method: 'POST',
      body: JSON.stringify({ url: 'https://example.com/feed.json' }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(data.created).toBe(1);
    expect(data.updated).toBe(1);
    expect(data.failed).toBe(0);

    expect(saveSiteData).toHaveBeenCalledTimes(1);
    const savedData = vi.mocked(saveSiteData).mock.calls[0]?.[0] as SiteData;
    expect(savedData.goods).toHaveLength(2);

    // Existing product retained curated metadata
    const updated = savedData.goods.find((g: Product) => g.code === 'EXISTING-1');
    expect(updated).toBeDefined();
    expect(updated?.title).toBe('Updated Name');
    expect(updated?.category).toBe('cosmetics');
    expect(updated?.visible).toBe(true);
    expect(updated?.sortPin).toBe(true);
    expect(updated?.relatedIds).toEqual(['prod-x']);

    // New product starts hidden (visible: false)
    const newlyCreated = savedData.goods.find((g: Product) => g.code === 'NEW-1');
    expect(newlyCreated).toBeDefined();
    expect(newlyCreated?.title).toBe('New Product');
    expect(newlyCreated?.visible).toBe(false);

    expect(appendActivity).toHaveBeenCalled();
  });
});
