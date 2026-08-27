import { describe, expect, it } from 'vitest';
import { collectHeroImages, serviceHeroImageUrls } from './hero-images';
import type { SiteData } from './types';

function minimalSite(partial: Partial<SiteData> = {}): SiteData {
  return {
    settings: {
      title: 't',
      description: 'd',
      logo: '/logo.png',
      favicon: '/f.ico',
      phones: [],
      headerPhone: { display: '1', tel: '1' },
      social: [],
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
    pages: [],
    goods: [],
    ...partial,
  };
}

describe('collectHeroImages', () => {
  it('maps path and slug to hero image', () => {
    const data = minimalSite({
      pages: [
        {
          id: 'p1',
          title: 'TV',
          description: '',
          slug: 'televizori',
          visible: true,
          sections: [
            {
              id: 'h1',
              type: 'hero',
              visible: true,
              titleHtml: 't',
              aboutLines: [],
              callbackTitle: '',
              callbackButtonText: '',
              callbackPlaceholder: '',
              image: '/img/tv.png',
              imageAlt: 'tv',
            },
          ],
        },
      ],
      servicesNav: [
        { id: 'n1', label: 'TV', href: '/televizori', slug: 'televizori', visible: true },
      ],
    });

    const map = collectHeroImages(data);
    expect(map['/televizori']).toBe('/img/tv.png');
    expect(map.televizori).toBe('/img/tv.png');
    expect(serviceHeroImageUrls(data.servicesNav, map)).toEqual(['/img/tv.png']);
  });

  it('skips hidden pages', () => {
    const data = minimalSite({
      pages: [
        {
          id: 'p1',
          title: 'X',
          description: '',
          slug: 'x',
          visible: false,
          sections: [
            {
              id: 'h1',
              type: 'hero',
              visible: true,
              titleHtml: 't',
              aboutLines: [],
              callbackTitle: '',
              callbackButtonText: '',
              callbackPlaceholder: '',
              image: '/img/x.png',
              imageAlt: 'x',
            },
          ],
        },
      ],
    });
    expect(collectHeroImages(data)).toEqual({});
  });
});
