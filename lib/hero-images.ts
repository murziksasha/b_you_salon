import type { HeroSection, SiteData } from './types';

/**
 * Collect hero image URLs keyed by page path (`/` or `/slug`) and by slug.
 * Used to prefetch service-page LCP images when ServicesNav is visible.
 */
export function collectHeroImages(data: SiteData): Record<string, string> {
  const map: Record<string, string> = {};

  for (const page of data.pages) {
    if (!page.visible) continue;
    const hero = page.sections.find(
      (s): s is HeroSection => s.type === 'hero' && s.visible !== false && Boolean((s as HeroSection).image),
    );
    if (!hero?.image) continue;

    const path = page.slug ? `/${page.slug}` : '/';
    map[path] = hero.image;
    if (page.slug) map[page.slug] = hero.image;
  }

  // Prefer nav href keys so prefetch matches Link targets
  for (const item of data.servicesNav) {
    if (!item.visible) continue;
    if (map[item.href]) continue;
    if (item.slug && map[item.slug]) {
      map[item.href] = map[item.slug];
    }
  }

  return map;
}

/** Unique image URLs for visible services nav items. */
export function serviceHeroImageUrls(
  servicesNav: SiteData['servicesNav'],
  heroImages: Record<string, string>,
): string[] {
  const urls = new Set<string>();
  for (const item of servicesNav) {
    if (!item.visible) continue;
    const url = heroImages[item.href] || heroImages[item.slug];
    if (url) urls.add(url);
  }
  return [...urls];
}
