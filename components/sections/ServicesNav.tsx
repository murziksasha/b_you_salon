'use client';

import Link from 'next/link';
import type { ServiceNavItem } from '@/lib/types';
import { prefetchImageUrl, usePrefetchImages } from '@/lib/use-prefetch-images';
import { serviceHeroImageUrls } from '@/lib/hero-images';

export function ServicesNav({
  items,
  activeSlug,
  heroImages = {},
}: {
  items: ServiceNavItem[];
  activeSlug?: string;
  /** href/slug → hero image URL for prefetch */
  heroImages?: Record<string, string>;
}) {
  const visible = items.filter((item) => item.visible);
  const prefetchUrls = serviceHeroImageUrls(visible, heroImages);
  usePrefetchImages(prefetchUrls);

  return (
    <nav className="services-nav" aria-label="Послуги">
      <ul className="services-nav__list">
        {visible.map((item) => {
          const heroUrl = heroImages[item.href] || heroImages[item.slug];
          return (
            <li
              key={item.id}
              className={`services-nav__item${activeSlug === item.slug ? ' services-nav__item_active' : ''}`}
            >
              <Link
                className="_list-reset"
                href={item.href}
                onMouseEnter={() => prefetchImageUrl(heroUrl)}
                onFocus={() => prefetchImageUrl(heroUrl)}
              >
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
