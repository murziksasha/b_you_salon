import { describe, expect, it } from 'vitest';
import { phoneForZone, sectionZoneHint, stickyKind, zoneFromPath, zoneWarnings } from './zone';
import type { Section, SiteSettings } from './types';

const settings = {
  headerPhone: { display: '063 128 45 51', tel: '+380631284551' },
  shopPhone: { display: '093 632 72 24', tel: '+380936327224' },
} as SiteSettings;

describe('zone helpers', () => {
  it('maps paths', () => {
    expect(zoneFromPath('/')).toBe('home');
    expect(zoneFromPath('/salon')).toBe('salon');
    expect(zoneFromPath('/salon/manicure')).toBe('salon');
    expect(zoneFromPath('/shop')).toBe('shop');
    expect(zoneFromPath('/shop/p-serum')).toBe('shop');
    expect(zoneFromPath('/cart')).toBe('shop');
  });

  it('sticky follows zone', () => {
    expect(stickyKind('home')).toBe('call');
    expect(stickyKind('salon')).toBe('book');
    expect(stickyKind('shop')).toBe('cart');
  });

  it('picks shop phone for shop zone', () => {
    expect(phoneForZone(settings, 'shop').display).toBe('093 632 72 24');
    expect(phoneForZone(settings, 'salon').display).toBe('063 128 45 51');
    expect(phoneForZone(settings, 'home').display).toBe('063 128 45 51');
  });

  it('warns on mixed sections', () => {
    const sections = [
      { id: '1', type: 'shop-grid', visible: true },
      { id: '2', type: 'contacts', visible: true },
    ] as Section[];
    const warnings = zoneWarnings(sections, 'salon');
    expect(warnings.some((w) => w.includes('shop-grid'))).toBe(true);
    expect(sectionZoneHint('doors-hero')).toBe('home');
  });
});
