import type { SalonService } from './types';

export function visibleServices(services: SalonService[] | undefined): SalonService[] {
  return (services || []).filter((s) => s.visible);
}

export function serviceBySlug(
  services: SalonService[] | undefined,
  slug: string,
): SalonService | undefined {
  return (services || []).find((s) => s.slug === slug && s.visible);
}

export function servicesByCategory(
  services: SalonService[] | undefined,
  category?: string,
  limit?: number,
): SalonService[] {
  let list = visibleServices(services);
  const cat = (category || '').trim();
  if (cat) list = list.filter((s) => (s.category || '').trim() === cat);
  const pinned = list.filter((s) => s.sortPin);
  const rest = list.filter((s) => !s.sortPin);
  const ordered = [...pinned, ...rest];
  if (typeof limit === 'number' && limit > 0) return ordered.slice(0, limit);
  return ordered;
}

export function uniqueServiceSlug(services: SalonService[], desired: string, exceptId?: string): string {
  const base = (desired || 'service')
    .toLowerCase()
    .replace(/[^a-z0-9а-яіїєґ-]+/gi, '-')
    .replace(/^-+|-+$/g, '') || 'service';
  let slug = base;
  let n = 1;
  const taken = (s: string) =>
    services.some((item) => item.slug === s && item.id !== exceptId);
  while (taken(slug)) {
    slug = `${base}-${n++}`;
  }
  return slug;
}

export function formatPriceFrom(priceFrom: number, note?: string): string {
  if (!priceFrom) return note || 'ціну уточнюйте';
  const amount = `${priceFrom.toLocaleString('uk-UA')} ₴`;
  return note ? `${note} ${amount}`.trim() : `від ${amount}`;
}
