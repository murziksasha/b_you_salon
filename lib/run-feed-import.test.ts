import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

vi.mock('./site-data', () => ({
  getSiteData: vi.fn(),
  saveSiteData: vi.fn(),
}));

vi.mock('./fetch-remote-image', () => ({
  fetchAndStoreImage: vi.fn(),
}));

import { getSiteData, saveSiteData } from './site-data';
import { runFeedImport, isFeedImportRunning } from './run-feed-import';
import type { SiteData, Product } from './types';

const feedJson = JSON.stringify({
  products: [
    { sku: 'A1', name: 'Alpha', price: '100', thumb: 'https://example.com/a.jpg' },
    { sku: 'A2', name: 'Beta', price: '200', thumb: '' },
  ],
});

beforeEach(() => {
  vi.clearAllMocks();
  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    text: async () => feedJson,
  } as unknown as Response);
});

afterEach(() => {
  vi.restoreAllMocks();
});

const existingProduct: Product = {
  id: 'prod-old',
  title: 'Old Name',
  description: 'Old description',
  code: 'A1',
  price: 80,
  image: '/uploads/old.webp',
  images: [],
  category: 'cosmetics',
  visible: true,
  inStock: false, // explicitly out of stock — must stay false after update
  sortPin: true,
  relatedIds: ['prod-x'],
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

describe('runFeedImport', () => {
  it('update keeps inStock:false; create sets inStock:true', async () => {
    vi.mocked(getSiteData).mockResolvedValue({ goods: [existingProduct] } as unknown as SiteData);
    vi.mocked(saveSiteData).mockResolvedValue(undefined as never);

    const result = await runFeedImport({ url: 'https://example.com/feed.json', downloadImages: false });
    expect(result.aborted).toBe(false);
    expect(result.created).toBe(1);
    expect(result.updated).toBe(1);

    const savedData = vi.mocked(saveSiteData).mock.calls[0]?.[0] as SiteData;
    const updated = savedData.goods.find((g: Product) => g.code === 'A1');
    expect(updated?.inStock).toBe(false); // preserved
    const created = savedData.goods.find((g: Product) => g.code === 'A2');
    expect(created?.inStock).toBe(true); // new row starts in stock
  });

  it('abort before save does not write catalog', async () => {
    vi.mocked(getSiteData).mockResolvedValue({ goods: [] } as unknown as SiteData);
    vi.mocked(saveSiteData).mockResolvedValue(undefined as never);

    const controller = new AbortController();
    // Abort immediately
    controller.abort();

    const result = await runFeedImport({
      url: 'https://example.com/feed.json',
      downloadImages: false,
      signal: controller.signal,
    });
    expect(result.aborted).toBe(true);
    expect(saveSiteData).not.toHaveBeenCalled();
  });
});
