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
  const salonPhone = phoneForZone(settings, 'salon');

  return (
    <footer className='by-footer'>
      <div className='by-wrap by-footer__grid'>
        <div className='by-footer__col'>
          <BrandMark />
          <p className='by-footer__lead'>Один простір — два входи.</p>
          <nav className='by-footer__nav' aria-label='Зони'>
            <Link href='/salon'>Салон</Link>
            <Link href='/shop'>Магазин</Link>
            <Link href='/#contacts'>Контакти</Link>
          </nav>
        </div>
        <div className='by-footer__col'>
          {settings.hours ? <p>{settings.hours}</p> : null}
          {settings.addressNote ? <p>{settings.addressNote}</p> : null}
          <p className='by-footer__phones'>
            {zone === 'shop' ? (
              <span className='by-footer__manager'>
                Менеджер{' '}
                <a href={formatTelHref(shopPhone.tel)}>{shopPhone.display}</a>
              </span>
            ) : (
              <>
                <a href={formatTelHref(salonPhone.tel)}>{salonPhone.display}</a>
                {settings.phones
                  .filter((p) => p.tel !== salonPhone.tel)
                  .map((p) => (
                    <a key={p.tel} href={formatTelHref(p.tel)}>
                      {p.display}
                    </a>
                  ))}
              </>
            )}
          </p>
        </div>
        <div className='by-footer__col'>
          {settings.social?.length ? (
            <p className='by-footer__social'>
              {settings.social.map((link) => (
                <a key={link.id} href={link.url} target='_blank' rel='noreferrer'>
                  {link.type}
                </a>
              ))}
            </p>
          ) : null}
          <p>
            <Link href={policyUrl}>Політика конфіденційності</Link>
          </p>
          <p>{copyright}</p>
        </div>
      </div>
    </footer>
  );
}
