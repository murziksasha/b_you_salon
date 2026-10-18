import { describe, expect, it } from 'vitest';
import {
  DEFAULT_OG_IMAGE,
  OG_LOCALE,
  buildPublicMetadata,
  shareImageFromSettings,
} from './seo-metadata';

describe('buildPublicMetadata', () => {
  it('emits Ukrainian Open Graph, Twitter, and canonical', () => {
    const meta = buildPublicMetadata(
      {
        title: 'B_You — студія краси',
        description: 'Салон і магазин косметики',
        path: '/',
      },
      'https://beyou.properservice.keenetic.pro',
    );

    expect(meta.title).toBe('B_You — студія краси');
    expect(meta.description).toBe('Салон і магазин косметики');
    expect(meta.alternates?.canonical).toBe('https://beyou.properservice.keenetic.pro/');
    expect(meta.openGraph?.locale).toBe(OG_LOCALE);
    expect(meta.openGraph?.url).toBe('https://beyou.properservice.keenetic.pro/');
    expect(meta.openGraph?.siteName).toBe('B_You');
    expect(meta.twitter && 'card' in meta.twitter ? meta.twitter.card : undefined).toBe(
      'summary_large_image',
    );
    const images = meta.openGraph?.images;
    expect(Array.isArray(images) && images[0]).toMatchObject({ url: DEFAULT_OG_IMAGE });
  });

  it('marks cart as noindex', () => {
    const meta = buildPublicMetadata({ title: 'Кошик', path: '/cart', index: false });
    expect(meta.robots).toMatchObject({ index: false, follow: false });
  });

  it('uses custom share image', () => {
    expect(shareImageFromSettings({ ogImage: '/uploads/og.jpg' })).toBe('/uploads/og.jpg');
    expect(shareImageFromSettings({})).toBe(DEFAULT_OG_IMAGE);
  });
});
