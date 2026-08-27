import type { Product, Section, SiteData } from './types';
import { isSafeUploadName } from './media-name';

export type MediaRefType =
  | 'product'
  | 'settings'
  | 'section'
  | 'social'
  | 'page';

export type MediaRef = {
  type: MediaRefType;
  id?: string;
  label: string;
};

export type MediaUsage = {
  /** Normalized path key, e.g. /uploads/foo.webp */
  key: string;
  /** Basename when key is under /uploads/ */
  name?: string;
  refs: MediaRef[];
};

/** Extract pathname for comparison (handles absolute URLs and query/hash). */
export function normalizeMediaUrl(url: string): string | null {
  if (!url || typeof url !== 'string') return null;
  const trimmed = url.trim();
  if (!trimmed) return null;
  try {
    if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
      const u = new URL(trimmed);
      return u.pathname || null;
    }
  } catch {
    // fall through
  }
  const pathOnly = trimmed.split('?')[0].split('#')[0];
  if (!pathOnly.startsWith('/')) return pathOnly ? `/${pathOnly}` : null;
  return pathOnly;
}

/** Upload filename from a media URL, or null if not a managed /uploads file. */
export function uploadNameFromUrl(url: string): string | null {
  const key = normalizeMediaUrl(url);
  if (!key) return null;
  if (!key.startsWith('/uploads/')) return null;
  const name = key.slice('/uploads/'.length);
  if (!name || name.includes('/') || !isSafeUploadName(name)) return null;
  return name;
}

function addRef(map: Map<string, MediaUsage>, url: string | undefined | null, ref: MediaRef) {
  if (!url) return;
  const key = normalizeMediaUrl(url);
  if (!key) return;
  const name = uploadNameFromUrl(url) ?? undefined;
  const existing = map.get(key);
  if (existing) {
    // Dedupe identical refs
    if (!existing.refs.some((r) => r.type === ref.type && r.id === ref.id && r.label === ref.label)) {
      existing.refs.push(ref);
    }
    return;
  }
  map.set(key, { key, name, refs: [ref] });
}

function walkSection(map: Map<string, MediaUsage>, section: Section, pageLabel: string) {
  const baseLabel = `${pageLabel} · ${section.type}`;
  const s = section as Section & Record<string, unknown>;

  if (typeof s.image === 'string') {
    addRef(map, s.image, { type: 'section', id: section.id, label: baseLabel });
  }
  if (Array.isArray(s.images)) {
    for (const img of s.images) {
      if (typeof img === 'string') {
        addRef(map, img, { type: 'section', id: section.id, label: `${baseLabel} (галерея)` });
      }
    }
  }
  if (Array.isArray(s.items)) {
    for (const item of s.items) {
      if (item && typeof item === 'object') {
        const row = item as Record<string, unknown>;
        if (typeof row.image === 'string') {
          addRef(map, row.image, { type: 'section', id: section.id, label: baseLabel });
        }
        if (typeof row.icon === 'string') {
          addRef(map, row.icon, { type: 'section', id: section.id, label: `${baseLabel} (іконка)` });
        }
      }
    }
  }
}

export function collectProductMediaUrls(product: Pick<Product, 'image' | 'images' | 'video'>): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const push = (u?: string) => {
    if (!u || !u.trim()) return;
    const key = normalizeMediaUrl(u) || u.trim();
    if (seen.has(key)) return;
    seen.add(key);
    out.push(u.trim());
  };
  push(product.image);
  for (const img of product.images || []) push(img);
  push(product.video);
  return out;
}

/** Map normalized media path → usages across the whole site (including hidden products). */
export function collectSiteMediaUsages(site: SiteData): Map<string, MediaUsage> {
  const map = new Map<string, MediaUsage>();

  const settings = site.settings;
  if (settings) {
    addRef(map, settings.logo, { type: 'settings', label: 'Налаштування · логотип' });
    addRef(map, settings.favicon, { type: 'settings', label: 'Налаштування · favicon' });
    for (const social of settings.social || []) {
      addRef(map, social.icon, {
        type: 'social',
        id: social.id,
        label: `Соцмережа · ${social.type}`,
      });
    }
  }

  for (const svc of site.services || []) {
    addRef(map, svc.image, { type: 'section', id: svc.id, label: `Послуга · ${svc.title}` });
    for (const img of svc.images || []) {
      addRef(map, img, { type: 'section', id: svc.id, label: `Послуга · ${svc.title}` });
    }
  }

  for (const product of site.goods || []) {
    const label = product.title?.trim() || product.id;
    addRef(map, product.image, { type: 'product', id: product.id, label: `Товар · ${label}` });
    for (const img of product.images || []) {
      addRef(map, img, { type: 'product', id: product.id, label: `Товар · ${label}` });
    }
    addRef(map, product.video, {
      type: 'product',
      id: product.id,
      label: `Товар · ${label} (відео)`,
    });
  }

  for (const page of site.pages || []) {
    const pageLabel = page.title?.trim() || page.slug || page.id;
    for (const section of page.sections || []) {
      walkSection(map, section, pageLabel);
    }
  }

  return map;
}

export function getUsageForUrl(site: SiteData, url: string): MediaRef[] {
  const key = normalizeMediaUrl(url);
  if (!key) return [];
  return collectSiteMediaUsages(site).get(key)?.refs || [];
}

export function getUsageForUploadName(site: SiteData, name: string): MediaRef[] {
  if (!isSafeUploadName(name)) return [];
  return getUsageForUrl(site, `/uploads/${name}`);
}

/** Short Ukrainian tooltip for blocked delete. */
export function formatUsageTooltip(refs: MediaRef[], max = 3): string {
  if (!refs.length) return '';
  const labels = refs.map((r) => r.label);
  const shown = labels.slice(0, max);
  const rest = labels.length - shown.length;
  const list = shown.map((l) => `«${l}»`).join(', ');
  if (rest > 0) return `Не можна видалити: використовується в ${list} і ще ${rest}`;
  return `Не можна видалити: використовується в ${list}`;
}

/**
 * From a product's media, which /uploads names can be purged after the product
 * is removed from `siteWithoutProduct`.
 */
export function planProductMediaPurge(
  product: Pick<Product, 'image' | 'images' | 'video' | 'title' | 'id'>,
  siteWithoutProduct: SiteData,
): {
  candidates: string[];
  deletable: string[];
  retained: Array<{ name: string; refs: MediaRef[] }>;
} {
  const usages = collectSiteMediaUsages(siteWithoutProduct);
  const candidates: string[] = [];
  const seen = new Set<string>();

  for (const url of collectProductMediaUrls(product)) {
    const name = uploadNameFromUrl(url);
    if (!name || seen.has(name)) continue;
    seen.add(name);
    candidates.push(name);
  }

  const deletable: string[] = [];
  const retained: Array<{ name: string; refs: MediaRef[] }> = [];

  for (const name of candidates) {
    const refs = usages.get(`/uploads/${name}`)?.refs || [];
    if (refs.length > 0) {
      retained.push({ name, refs });
    } else {
      deletable.push(name);
    }
  }

  return { candidates, deletable, retained };
}

/** Ordered unique gallery from product fields (primary first). */
export function productGalleryFromFields(product: Pick<Product, 'image' | 'images'>): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const push = (u?: string) => {
    if (!u || !u.trim()) return;
    const t = u.trim();
    if (seen.has(t)) return;
    seen.add(t);
    out.push(t);
  };
  push(product.image);
  for (const img of product.images || []) push(img);
  return out;
}

export const PRODUCT_PLACEHOLDER_IMAGE = '/img/services/technika_img.png';
export const PRODUCT_GALLERY_MAX = 12;

/** Split ordered gallery back into Product.image + images. */
export function productFieldsFromGallery(gallery: string[]): { image: string; images: string[] } {
  const unique = productGalleryFromFields({
    image: gallery[0] || '',
    images: gallery.slice(1),
  });
  if (unique.length === 0) {
    return { image: PRODUCT_PLACEHOLDER_IMAGE, images: [] };
  }
  return { image: unique[0], images: unique.slice(1) };
}
