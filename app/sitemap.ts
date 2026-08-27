import type { MetadataRoute } from 'next';
import { getSiteData } from '@/lib/site-data';

export const dynamic = 'force-dynamic';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = (process.env.SITE_URL || '').replace(/\/$/, '');
  const data = await getSiteData();
  const now = new Date();

  const entries: MetadataRoute.Sitemap = [
    {
      url: base ? `${base}/` : '/',
      lastModified: now,
      changeFrequency: 'weekly',
      priority: 1,
    },
    {
      url: base ? `${base}/shop` : '/shop',
      lastModified: now,
      changeFrequency: 'weekly',
      priority: 0.8,
    },
    {
      url: base ? `${base}/salon` : '/salon',
      lastModified: now,
      changeFrequency: 'weekly',
      priority: 0.9,
    },
  ];

  for (const page of data.pages) {
    if (!page.visible || page.slug === '' || page.slug === 'shop' || page.slug === 'salon') continue;
    const path =
      page.zone === 'salon' ? `/salon/${page.slug}` : `/${page.slug}`;
    entries.push({
      url: base ? `${base}${path}` : path,
      lastModified: now,
      changeFrequency: 'weekly',
      priority: 0.7,
    });
  }

  for (const product of data.goods) {
    if (!product.visible) continue;
    entries.push({
      url: base ? `${base}/shop/${product.id}` : `/shop/${product.id}`,
      lastModified: now,
      changeFrequency: 'monthly',
      priority: 0.5,
    });
  }

  return entries;
}
