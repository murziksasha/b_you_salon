import { headers } from 'next/headers';
import { resolvePublicSiteUrl } from './public-site-url';

/** Public origin for the current request (SITE_URL or Host / X-Forwarded-*). */
export async function requestSiteUrl(): Promise<string | undefined> {
  return resolvePublicSiteUrl(await headers());
}
