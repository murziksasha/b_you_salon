import type { Metadata } from 'next';
import { absoluteUrl } from './public-site-url';

export const DEFAULT_OG_IMAGE = '/img/og-cover.jpg';
export const SITE_NAME = 'B_You';
export const OG_LOCALE = 'uk_UA';

export const DEFAULT_SEO_KEYWORDS = [
  'салон краси',
  'манікюр',
  'педікюр',
  'зачіски',
  'косметика',
  'B_You',
];

export type PublicOgType = 'website' | 'article';

export type BuildPublicMetadataInput = {
  title: string;
  description?: string;
  path?: string;
  image?: string | string[];
  ogType?: PublicOgType;
  index?: boolean;
  siteName?: string;
  keywords?: string[];
};

function firstImage(image?: string | string[]): string {
  if (Array.isArray(image)) {
    const found = image.find((u) => typeof u === 'string' && u.trim());
    return found || DEFAULT_OG_IMAGE;
  }
  return image?.trim() || DEFAULT_OG_IMAGE;
}

function imageList(image?: string | string[]): string[] {
  const list = (Array.isArray(image) ? image : image ? [image] : [])
    .map((u) => u.trim())
    .filter(Boolean);
  return list.length ? list.slice(0, 4) : [DEFAULT_OG_IMAGE];
}

export function shareImageFromSettings(settings?: {
  ogImage?: string;
}): string {
  return settings?.ogImage?.trim() || DEFAULT_OG_IMAGE;
}

/** Next.js Metadata for public pages (uk + Open Graph + Twitter + canonical). */
export function buildPublicMetadata(
  input: BuildPublicMetadataInput,
  siteUrl?: string,
): Metadata {
  const title = input.title.trim() || SITE_NAME;
  const description = (input.description || '').trim() || undefined;
  const path = input.path || '/';
  const pageUrl = absoluteUrl(path, siteUrl);
  const images = imageList(input.image);
  const primary = firstImage(input.image);
  const siteName = input.siteName || SITE_NAME;
  const index = input.index !== false;

  const ogImages = images.map((url) => ({
    url,
    width: url === DEFAULT_OG_IMAGE || url === shareImageFromSettings() ? 1200 : undefined,
    height: url === DEFAULT_OG_IMAGE || url === shareImageFromSettings() ? 630 : undefined,
    alt: title,
  }));

  return {
    title,
    description,
    keywords: input.keywords,
    alternates: {
      canonical: pageUrl,
    },
    openGraph: {
      type: input.ogType || 'website',
      locale: OG_LOCALE,
      siteName,
      title,
      description,
      url: pageUrl,
      images: ogImages,
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [primary],
    },
    robots: index
      ? { index: true, follow: true }
      : { index: false, follow: false },
  };
}
