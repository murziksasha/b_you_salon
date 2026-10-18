import { getSiteData, saveSiteData } from './site-data';
import { createId } from './id';
import { PRODUCT_PLACEHOLDER_IMAGE } from './media-usage';
import {
  parseLivestaJson,
  parseLivestaXml,
  buildCharacteristics,
  cleanFeedDescription,
  detectFeedFormat,
  type FeedProduct,
} from './feed-import';
import { fetchAndStoreImage } from './fetch-remote-image';
import type { Product } from './types';

export type RunFeedImportOptions = {
  url: string;
  downloadImages: boolean;
  /** If provided, the import checks signal between batches and before save. */
  signal?: AbortSignal;
  onProgress?: (current: number, total: number) => void;
};

export type RunFeedImportResult = {
  created: number;
  updated: number;
  failed: number;
  format: string;
  aborted: boolean;
};

const FEED_TIMEOUT_MS = 30_000;

async function fetchFeed(url: string, signal?: AbortSignal): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FEED_TIMEOUT_MS);
  // Link external abort to internal controller
  signal?.addEventListener('abort', () => controller.abort(), { once: true });
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: 'application/json, application/xml, text/xml, */*' },
    });
    if (!res.ok) throw new Error(`Feed responded with ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}

function buildNewProduct(fp: FeedProduct, imageUrl: string): Omit<Product, 'id'> {
  const characteristics = buildCharacteristics(fp);
  const promoText = fp.rrp && fp.rrp > fp.price ? `До знижки: ${fp.rrp.toLocaleString('uk-UA')} ₴` : undefined;
  return {
    title: fp.name,
    description: cleanFeedDescription(fp.description),
    characteristics: characteristics || undefined,
    price: fp.price,
    image: imageUrl || PRODUCT_PLACEHOLDER_IMAGE,
    images: [],
    visible: false,
    code: fp.sku,
    inStock: true,
    promoText,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

/**
 * One in-process import lock symbol. Stored on globalThis so it survives HMR.
 */
type GlobalImportLock = { __byouFeedImportRunning?: boolean };

function importLock(): GlobalImportLock {
  return globalThis as GlobalImportLock;
}

export function isFeedImportRunning(): boolean {
  return Boolean(importLock().__byouFeedImportRunning);
}

/**
 * Shared merge loop used by both the HTTP route and the background runner.
 * Throws on feed fetch/parse failure.
 * Returns aborted:true if the signal fired before save (catalog is NOT written).
 */
export async function runFeedImport(opts: RunFeedImportOptions): Promise<RunFeedImportResult> {
  const lock = importLock();
  if (lock.__byouFeedImportRunning) {
    return { created: 0, updated: 0, failed: 0, format: '', aborted: false };
  }
  lock.__byouFeedImportRunning = true;
  try {
    return await _run(opts);
  } finally {
    lock.__byouFeedImportRunning = false;
  }
}

async function _run(opts: RunFeedImportOptions): Promise<RunFeedImportResult> {
  const { url, downloadImages, signal, onProgress } = opts;

  const rawText = await fetchFeed(url, signal);
  if (signal?.aborted) return { created: 0, updated: 0, failed: 0, format: '', aborted: true };

  const format = detectFeedFormat(url, rawText);
  let feedProducts: FeedProduct[];
  if (format === 'xml') {
    feedProducts = parseLivestaXml(rawText);
  } else {
    const json = JSON.parse(rawText) as unknown;
    feedProducts = parseLivestaJson(json);
  }

  if (!feedProducts.length) {
    throw new Error('Feed contains no parseable products');
  }

  const total = feedProducts.length;
  const siteData = await getSiteData();
  const goods = [...siteData.goods];
  let created = 0;
  let updated = 0;
  const errors: string[] = [];

  const batchSize = downloadImages ? 5 : 50;

  for (let i = 0; i < total; i += batchSize) {
    if (signal?.aborted) return { created, updated, failed: errors.length, format, aborted: true };

    const chunk = feedProducts.slice(i, i + batchSize);
    await Promise.all(
      chunk.map(async fp => {
        let imageUrl = fp.thumbUrl || PRODUCT_PLACEHOLDER_IMAGE;
        const existingIdx = fp.sku ? goods.findIndex(g => g.code === fp.sku) : -1;

        if (existingIdx >= 0 && goods[existingIdx]?.image?.startsWith('/uploads/')) {
          imageUrl = goods[existingIdx].image;
        } else if (downloadImages && fp.thumbUrl) {
          try {
            const stored = await fetchAndStoreImage(fp.thumbUrl, 'product');
            if (stored) imageUrl = stored;
          } catch {
            errors.push(`Image download failed for SKU ${fp.sku}`);
          }
        }

        const patch = buildNewProduct(fp, imageUrl);

        if (existingIdx >= 0) {
          const curr = goods[existingIdx];
          if (curr) {
            goods[existingIdx] = {
              ...curr,
              ...patch,
              id: curr.id,
              category: curr.category,
              sortPin: curr.sortPin,
              relatedIds: curr.relatedIds,
              visible: curr.visible,
              // Keep existing inStock — feed has no stock flag
              inStock: curr.inStock,
              updatedAt: new Date().toISOString(),
            };
            updated++;
          }
        } else {
          goods.push({ id: createId(), ...patch });
          created++;
        }
      }),
    );

    onProgress?.(Math.min(i + batchSize, total), total);
    await new Promise(r => setTimeout(r, 2));
  }

  // Final abort check before write
  if (signal?.aborted) return { created, updated, failed: errors.length, format, aborted: true };

  await saveSiteData({ ...siteData, goods });
  return { created, updated, failed: errors.length, format, aborted: false };
}
