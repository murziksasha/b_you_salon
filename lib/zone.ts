import type { MenuItem, PhoneEntry, Section, SiteData, SiteSettings, ZoneId } from './types';

export function zoneFromPath(pathname: string): ZoneId {
  const path = (pathname || '/').split('?')[0];
  if (path === '/cart' || path === '/shop' || path.startsWith('/shop/')) return 'shop';
  if (path === '/salon' || path.startsWith('/salon/')) return 'salon';
  return 'home';
}

export function menuForZone(data: SiteData, zone: ZoneId): MenuItem[] {
  const pick = (items?: MenuItem[]) => (items || []).filter((item) => item.visible);
  if (zone === 'salon') {
    const salon = pick(data.headerMenuSalon);
    return salon.length ? salon : pick(data.headerMenu);
  }
  if (zone === 'shop') {
    const shop = pick(data.headerMenuShop);
    return shop.length ? shop : pick(data.headerMenu);
  }
  return pick(data.headerMenu);
}

const SHOP_TYPES = new Set(['shop-grid']);
const SALON_TYPES = new Set(['services-grid', 'price-list']);
const HOME_TYPES = new Set(['doors-hero']);

export function sectionZoneHint(type: string): ZoneId | 'any' {
  if (SHOP_TYPES.has(type)) return 'shop';
  if (SALON_TYPES.has(type)) return 'salon';
  if (HOME_TYPES.has(type)) return 'home';
  return 'any';
}

export function zoneWarnings(sections: Section[], zone: ZoneId): string[] {
  const warnings: string[] = [];
  for (const section of sections) {
    const hint = sectionZoneHint(section.type);
    if (hint !== 'any' && hint !== zone) {
      warnings.push(`«${section.type}» зазвичай для зони «${hint}», зараз сторінка «${zone}»`);
    }
  }
  return warnings;
}

export function stickyKind(zone: ZoneId): 'call' | 'book' | 'cart' {
  if (zone === 'salon') return 'book';
  if (zone === 'shop') return 'cart';
  return 'call';
}

/** Header / sticky call phone for the active zone. */
export function phoneForZone(settings: SiteSettings, zone: ZoneId): PhoneEntry {
  if (zone === 'shop' && settings.shopPhone?.tel) return settings.shopPhone;
  return settings.headerPhone;
}
