import { describe, expect, it } from 'vitest';
import type { SiteData } from './types';
import {
  collectProductMediaUrls,
  collectSiteMediaUsages,
  formatUsageTooltip,
  normalizeMediaUrl,
  planProductMediaPurge,
  productFieldsFromGallery,
  productGalleryFromFields,
  uploadNameFromUrl,
  PRODUCT_PLACEHOLDER_IMAGE,
} from './media-usage';

function baseSite(over: Partial<SiteData> = {}): SiteData {
  return {
    settings: {
      title: 'T',
      description: '',
      logo: '/img/icons/logo.png',
      favicon: '/img/icons/favicon.ico',
      phones: [],
      headerPhone: { display: '', tel: '' },
      social: [{ id: 's1', type: 'viber', url: '#', icon: '/uploads/social.webp' }],
      hours: '',
      address: '',
      addressNote: '',
      officeHours: '',
      email: '',
      mapEmbedUrl: '',
      copyright: '',
      privacyPolicyUrl: '',
      privacyPolicyText: '',
    },
    headerMenu: [],
    servicesNav: [],
    pages: [
      {
        id: 'p1',
        slug: '',
        title: 'Home',
        description: '',
        visible: true,
        sections: [
          {
            id: 'h1',
            type: 'hero',
            visible: true,
            titleHtml: '',
            aboutLines: [],
            callbackTitle: '',
            callbackButtonText: '',
            callbackPlaceholder: '',
            image: '/uploads/hero.webp',
            imageAlt: '',
          },
        ],
      },
    ],
    goods: [
      {
        id: 'g1',
        title: 'Phone A',
        description: '',
        price: 100,
        image: '/uploads/a.webp',
        images: ['/uploads/b.webp'],
        video: '/uploads/review.mp4',
        visible: true,
      },
      {
        id: 'g2',
        title: 'Phone B',
        description: '',
        price: 200,
        image: '/uploads/a.webp',
        images: [],
        visible: false,
      },
    ],
    ...over,
  };
}

describe('normalizeMediaUrl / uploadNameFromUrl', () => {
  it('normalizes paths and absolute URLs', () => {
    expect(normalizeMediaUrl('/uploads/x.webp')).toBe('/uploads/x.webp');
    expect(normalizeMediaUrl('/uploads/x.webp?v=1#h')).toBe('/uploads/x.webp');
    expect(normalizeMediaUrl('https://example.com/uploads/x.webp')).toBe('/uploads/x.webp');
  });

  it('only returns safe upload basenames', () => {
    expect(uploadNameFromUrl('/uploads/ok.webp')).toBe('ok.webp');
    expect(uploadNameFromUrl('/img/logo.png')).toBeNull();
    expect(uploadNameFromUrl('/uploads/../evil')).toBeNull();
  });
});

describe('collectSiteMediaUsages', () => {
  it('tracks products (including hidden), settings and sections', () => {
    const map = collectSiteMediaUsages(baseSite());
    expect(map.get('/uploads/a.webp')?.refs.some((r) => r.id === 'g1')).toBe(true);
    expect(map.get('/uploads/a.webp')?.refs.some((r) => r.id === 'g2')).toBe(true);
    expect(map.get('/uploads/review.mp4')?.refs[0]?.type).toBe('product');
    expect(map.get('/uploads/hero.webp')?.refs[0]?.type).toBe('section');
    expect(map.get('/uploads/social.webp')?.refs[0]?.type).toBe('social');
    expect(map.get('/img/icons/logo.png')?.refs[0]?.type).toBe('settings');
  });
});

describe('planProductMediaPurge', () => {
  it('keeps shared uploads and allows orphans', () => {
    const site = baseSite();
    const product = site.goods[0];
    const without = { ...site, goods: site.goods.filter((g) => g.id !== product.id) };
    const plan = planProductMediaPurge(product, without);

    expect(plan.candidates).toEqual(expect.arrayContaining(['a.webp', 'b.webp', 'review.mp4']));
    // a.webp still used by g2
    expect(plan.retained.some((r) => r.name === 'a.webp')).toBe(true);
    expect(plan.deletable).toEqual(expect.arrayContaining(['b.webp', 'review.mp4']));
    expect(plan.deletable).not.toContain('a.webp');
  });

  it('does not treat static /img as candidates', () => {
    const product = {
      id: 'x',
      title: 'X',
      image: PRODUCT_PLACEHOLDER_IMAGE,
      images: [] as string[],
    };
    const plan = planProductMediaPurge(product, baseSite());
    expect(plan.candidates).toEqual([]);
  });
});

describe('gallery helpers', () => {
  it('round-trips primary + extras', () => {
    const gallery = productGalleryFromFields({
      image: '/uploads/1.webp',
      images: ['/uploads/2.webp', '/uploads/1.webp'],
    });
    expect(gallery).toEqual(['/uploads/1.webp', '/uploads/2.webp']);
    expect(productFieldsFromGallery(gallery)).toEqual({
      image: '/uploads/1.webp',
      images: ['/uploads/2.webp'],
    });
  });

  it('uses placeholder for empty gallery', () => {
    expect(productFieldsFromGallery([])).toEqual({
      image: PRODUCT_PLACEHOLDER_IMAGE,
      images: [],
    });
  });

  it('collectProductMediaUrls includes video', () => {
    expect(
      collectProductMediaUrls({
        image: '/uploads/a.webp',
        images: ['/uploads/b.webp'],
        video: '/uploads/v.mp4',
      }),
    ).toEqual(['/uploads/a.webp', '/uploads/b.webp', '/uploads/v.mp4']);
  });
});

describe('formatUsageTooltip', () => {
  it('lists labels and remaining count', () => {
    const tip = formatUsageTooltip(
      [
        { type: 'product', label: 'Товар · A' },
        { type: 'product', label: 'Товар · B' },
        { type: 'product', label: 'Товар · C' },
        { type: 'product', label: 'Товар · D' },
      ],
      2,
    );
    expect(tip).toContain('Товар · A');
    expect(tip).toContain('і ще 2');
  });
});
