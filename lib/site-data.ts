import { promises as fs } from 'fs';
import path from 'path';
import { atomicWriteJson } from './atomic-write';
import { createId } from './id';
import type { Page, Product, SalonService, SiteData } from './types';

const DEFAULT_SHOP_PHONE = { display: '093 632 72 24', tel: '+380936327224' };

function normalizeSiteData(data: SiteData): SiteData {
  return {
    ...data,
    settings: {
      ...data.settings,
      shopPhone: data.settings?.shopPhone?.tel ? data.settings.shopPhone : DEFAULT_SHOP_PHONE,
    },
    services: data.services || [],
    headerMenuSalon: data.headerMenuSalon || data.headerMenu,
    headerMenuShop: data.headerMenuShop || data.headerMenu,
  };
}

const DEFAULT_DATA_PATH = path.join(process.cwd(), 'data', 'site.json');

function getDataFilePath(): string {
  const dataDir = process.env.DATA_DIR;
  if (dataDir) {
    return path.join(dataDir, 'site.json');
  }
  return DEFAULT_DATA_PATH;
}

async function ensureDataDir(filePath: string): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
}

export async function getSiteData(): Promise<SiteData> {
  const filePath = getDataFilePath();
  try {
    const raw = await fs.readFile(filePath, 'utf-8');
    let data = JSON.parse(raw) as SiteData;
    // Apply due scheduled publishes (best-effort write-back)
    try {
      const { applyScheduledPublishes } = await import('./scheduled-publish');
      const { site: next, published } = applyScheduledPublishes(data);
      if (published.length) {
        data = await saveSiteData(next);
        try {
          const { appendActivity } = await import('./admin-activity');
          await appendActivity({
            kind: 'site_save',
            message: `Scheduled publish: ${published.length} page(s)`,
          });
        } catch {
          /* ignore */
        }
      } else {
        data = next;
      }
    } catch {
      /* ignore schedule errors */
    }
    return normalizeSiteData(data);
  } catch {
    const { defaultSiteData } = await import('./default-site-data');
    await ensureDataDir(filePath);
    await atomicWriteJson(filePath, defaultSiteData);
    return normalizeSiteData(defaultSiteData);
  }
}

export async function saveSiteData(data: SiteData): Promise<SiteData> {
  const filePath = getDataFilePath();
  await ensureDataDir(filePath);

  // Price history when goods change
  try {
    const prevRaw = await fs.readFile(filePath, 'utf-8').catch(() => '');
    if (prevRaw) {
      const prev = JSON.parse(prevRaw) as SiteData;
      const { recordPriceChange } = await import('./price-history');
      const prevById = new Map((prev.goods || []).map((g) => [g.id, g]));
      for (const g of data.goods || []) {
        const old = prevById.get(g.id);
        if (old && old.price !== g.price) {
          await recordPriceChange({
            productId: g.id,
            price: g.price,
            title: g.title,
            prevPrice: old.price,
          });
        }
      }
    }
  } catch {
    /* ignore price history errors */
  }

  const next: SiteData = {
    ...data,
    updatedAt: new Date().toISOString(),
  };
  await atomicWriteJson(filePath, next);

  // Rolling snapshots under data/backups (failures must not block save)
  if (process.env.AUTO_BACKUP !== 'false') {
    try {
      const { createSiteBackupFromData } = await import('./backup');
      await createSiteBackupFromData(next, { label: 'autosave' });
    } catch (err) {
      console.error('[backup] auto snapshot failed', err);
    }
  }
  return next;
}

export async function getPages(): Promise<Page[]> {
  const data = await getSiteData();
  return data.pages.filter((page) => page.visible);
}

export async function getPage(slug: string): Promise<Page | undefined> {
  const data = await getSiteData();
  return data.pages.find((page) => page.slug === slug && page.visible);
}

export async function getProducts(): Promise<Product[]> {
  const data = await getSiteData();
  return data.goods.filter((product) => product.visible);
}

export async function getProduct(id: string): Promise<Product | undefined> {
  const data = await getSiteData();
  return data.goods.find((product) => product.id === id);
}

export async function getServices(): Promise<SalonService[]> {
  const data = await getSiteData();
  return (data.services || []).filter((service) => service.visible);
}

export async function getServiceBySlug(slug: string): Promise<SalonService | undefined> {
  const data = await getSiteData();
  return (data.services || []).find((service) => service.slug === slug && service.visible);
}

export async function saveProduct(product: Product): Promise<void> {
  const data = await getSiteData();
  const index = data.goods.findIndex((item) => item.id === product.id);

  if (index >= 0) {
    data.goods[index] = product;
  } else {
    data.goods.push(product);
  }

  await saveSiteData(data);
}

export async function deleteProduct(id: string): Promise<boolean> {
  const data = await getSiteData();
  const initialLength = data.goods.length;
  data.goods = data.goods.filter((product) => product.id !== id);

  if (data.goods.length === initialLength) {
    return false;
  }

  await saveSiteData(data);
  return true;
}

export async function createPage(page: Omit<Page, 'id'> & { id?: string }): Promise<Page> {
  const data = await getSiteData();
  const newPage: Page = {
    id: page.id || createId(),
    ...page,
  } as Page;

  // ensure unique slug
  let slug = newPage.slug;
  let suffix = 1;
  while (data.pages.some((p) => p.slug === slug)) {
    slug = `${page.slug || 'page'}-${suffix++}`;
  }
  newPage.slug = slug;

  data.pages.push(newPage);
  await saveSiteData(data);
  return newPage;
}

export async function deletePage(id: string): Promise<boolean> {
  const data = await getSiteData();
  // protect home
  const target = data.pages.find((p) => p.id === id);
  if (!target || target.slug === '') return false;

  const before = data.pages.length;
  data.pages = data.pages.filter((p) => p.id !== id);
  if (data.pages.length === before) return false;

  await saveSiteData(data);
  return true;
}

export function getDataFilePathForScripts(): string {
  return getDataFilePath();
}