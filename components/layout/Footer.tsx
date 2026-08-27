'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { BrandMark } from '@/components/brand/BrandMark';
import type { SiteSettings } from '@/lib/types';
import { formatTelHref } from '@/lib/phone';
import { phoneForZone, zoneFromPath } from '@/lib/zone';

export function Footer({ settings }: { settings: SiteSettings }) {
  const pathname = usePathname() || '/';
  const zone = zoneFromPath(pathname);
  const year = new Date().getFullYear();
  const copyright = (settings.copyright || `© ${year} B_You`).replace(/2017/, String(year));
  const policyUrl = settings.privacyPolicyUrl || '/confident';
  const shopPhone = phoneForZone(settings, 'shop');

  return (
    <footer className='by-footer'>
      <div className='by-wrap'>
        <BrandMark />
        <p>
          Салон праворуч · магазин косметики ліворуч
          {settings.hours ? ` · ${settings.hours}` : ''}
        </p>
        <p className='by-footer__phones'>
          {zone === 'shop' ? (
            <span className='by-footer__manager'>
              Менеджер{' '}
              <a href={formatTelHref(shopPhone.tel)}>{shopPhone.display}</a>
            </span>
          ) : (
            settings.phones.map((p) => (
              <a key={p.tel} href={formatTelHref(p.tel)}>
                {p.display}
              </a>
            ))
          )}
        </p>
        <p>
          <Link href={policyUrl}>Політика конфіденційності</Link>
          {' · '}
          {copyright}
        </p>
      </div>
    </footer>
  );
}
