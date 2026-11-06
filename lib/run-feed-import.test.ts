import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

vi.mock('./site-data', () => ({
  getSiteData: vi.fn(),
  saveSiteData: vi.fn(),
  withSiteDataLock: vi.fn(async (fn: () => Promise<unknown>) => fn()),
}));

vi.mock('./fetch-remote-image', () => ({
  fetchAndStoreImage: vi.fn(),
}));

import { getSiteData, saveSiteData } from './site-data';
import {
  runFeedImport,
  isFeedImportRunning,
  acquireFeedImportLock,
  releaseFeedImportLock,
  FeedImportConflictError,
} from './run-feed-import';
import type { SiteData, Product } from './types';

const feedJson = JSON.stringify({
  products: [
    { sku: 'A1', name: 'Alpha', price: '100', thumb: 'https://example.com/a.jpg' },
    { sku: 'A2', name: 'Beta', price: '200', thumb: '' },
  ],
});

beforeEach(() => {
  vi.clearAllMocks();
  // Ensure lock is clear before each test
  releaseFeedImportLock();
  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    text: async () => feedJson,
  } as unknown as Response);
});

afterEach(() => {
  releaseFeedImportLock();
});

const baseSiteData: SiteData = {
  headerMenu: [],
  servicesNav: [],
  pages: [],
  goods: [
    {
      id: 'existing-1',
      code: 'A1',
      title: 'Old Alpha',
      description: 'Old Alpha desc',
      image: '/placeholder.jpg',
      price: 90,
      inStock: false, // Must remain false after update
      category: 'hair',
      sortPin: true,
      visible: true,
      updatedAt: '2026-01-01T00:00:00Z',
    },
  ],
  services: [],
  goodsCategories: [],
  settings: {} as any,
  updatedAt: '2026-01-01T00:00:00Z',
};

describe('runFeedImport', () => {
  it('update keeps inStock:false; create sets inStock:true', async () => {
    vi.mocked(getSiteData).mockResolvedValue(baseSiteData);
    vi.mocked(saveSiteData).mockResolvedValue({} as SiteData);

    const result = await runFeedImport({ url: 'https://example.com/feed.json', downloadImages: false });

    expect(result.created).toBe(1);
    expect(result.updated).toBe(1);
    expect(result.failed).toBe(0);
    expect(result.aborted).toBe(false);

    expect(saveSiteData).toHaveBeenCalledOnce();
    const saved = vi.mocked(saveSiteData).mock.calls[0][0];

    const a1 = saved.goods.find((g: Product) => g.code === 'A1');
    expect(a1?.inStock).toBe(false); // Preserved!
    expect(a1?.sortPin).toBe(true); // Preserved!
    expect(a1?.category).toBe('hair'); // Preserved!
    expect(a1?.title).toBe('Alpha'); // Updated from feed

    const a2 = saved.goods.find((g: Product) => g.code === 'A2');
    expect(a2?.inStock).toBe(true); // New product defaults to inStock:true
    expect(a2?.title).toBe('Beta');
  });

  it('abort before save does not write catalog', async () => {
    vi.mocked(getSiteData).mockResolvedValue(baseSiteData);

    const controller = new AbortController();
    controller.abort(); // already aborted

    const result = await runFeedImport({
      url: 'https://example.com/feed.json',
      downloadImages: false,
      signal: controller.signal,
    });

    expect(result.aborted).toBe(true);
    expect(saveSiteData).not.toHaveBeenCalled();
  });

  it('acquires lock during run and releases lock after run', async () => {
    vi.mocked(getSiteData).mockResolvedValue(baseSiteData);
    vi.mocked(saveSiteData).mockResolvedValue({} as SiteData);

    let lockedDuringRun = false;
    await runFeedImport({
      url: 'https://example.com/feed.json',
      downloadImages: false,
      onProgress: () => {
        if (isFeedImportRunning()) lockedDuringRun = true;
      },
    });

    expect(lockedDuringRun).toBe(true);
    expect(isFeedImportRunning()).toBe(false);
  });

  it('throws FeedImportConflictError when lock is already acquired', async () => {
    acquireFeedImportLock();
    expect(isFeedImportRunning()).toBe(true);

    await expect(
      runFeedImport({ url: 'https://example.com/feed.json', downloadImages: false }),
    ).rejects.toThrow(FeedImportConflictError);

    releaseFeedImportLock();
  });

  it('invokes onStatus, onStart, and onProgress callbacks', async () => {
    vi.mocked(getSiteData).mockResolvedValue(baseSiteData);
    vi.mocked(saveSiteData).mockResolvedValue({} as SiteData);

    const statuses: string[] = [];
    let startTotal = 0;
    const progressList: number[] = [];

    await runFeedImport({
      url: 'https://example.com/feed.json',
      downloadImages: false,
      onStatus: s => statuses.push(s),
      onStart: t => { startTotal = t; },
      onProgress: p => progressList.push(p.current),
    });

    expect(statuses.length).toBeGreaterThan(0);
    expect(startTotal).toBe(2);
    expect(progressList.length).toBeGreaterThan(0);
  });
});
