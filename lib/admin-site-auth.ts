import {
  roleCan,
  siteSectionCapability,
  type AdminCapability,
  type AdminRole,
} from './admin-roles';
import type { SiteData } from './types';

export const SITE_WRITE_SECTIONS = [
  'settings',
  'headerMenu',
  'headerMenuSalon',
  'headerMenuShop',
  'servicesNav',
  'shopLink',
  'pages',
  'goods',
  'services',
] as const;

export type SiteWriteSection = (typeof SITE_WRITE_SECTIONS)[number];

function sameJson(a: unknown, b: unknown): boolean {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}

export function changedSiteSections(current: SiteData, next: SiteData): SiteWriteSection[] {
  const changed: SiteWriteSection[] = [];
  for (const key of SITE_WRITE_SECTIONS) {
    if (!sameJson(current[key], next[key])) changed.push(key);
  }
  return changed;
}

/** First capability the actor is missing for the changed slices, or null if allowed. */
export function siteWriteDeniedCapability(
  role: AdminRole | 'legacy',
  grants: readonly string[] | undefined,
  current: SiteData,
  next: SiteData,
): AdminCapability | null {
  const changed = changedSiteSections(current, next);
  if (!changed.length) return null;
  for (const section of changed) {
    const cap = siteSectionCapability(section);
    if (!cap) continue;
    if (!roleCan(role, cap, grants)) return cap;
  }
  return null;
}
