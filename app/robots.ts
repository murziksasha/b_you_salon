import type { MetadataRoute } from 'next';
import { requestSiteUrl } from '@/lib/request-site-url';

export default async function robots(): Promise<MetadataRoute.Robots> {
  const base = (await requestSiteUrl()) || '';

  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/admin', '/admin/', '/api/', '/cart', '/thanks'],
      },
    ],
    sitemap: base ? `${base}/sitemap.xml` : undefined,
  };
}
