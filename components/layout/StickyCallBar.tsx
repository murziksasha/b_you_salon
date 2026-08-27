'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useCart } from '@/components/cart/CartProvider';
import type { SiteSettings } from '@/lib/types';
import { formatTelHref } from '@/lib/phone';
import { phoneForZone, stickyKind, zoneFromPath } from '@/lib/zone';

export function StickyCallBar({ settings }: { settings: SiteSettings }) {
  const pathname = usePathname() || '/';
  const zone = zoneFromPath(pathname);
  const kind = stickyKind(zone);
  const phone = phoneForZone(settings, zone);
  const telHref = formatTelHref(phone.tel);
  const { count } = useCart();

  if (!phone?.tel) return null;

  return (
    <div className='sticky-call' role='region' aria-label='Швидкі дії'>
      {kind === 'book' ? (
        <Link className='sticky-call__book' href='/salon#callback'>
          Записатись
        </Link>
      ) : null}
      {kind === 'cart' ? (
        <Link className='sticky-call__cart' href='/cart'>
          Кошик{count ? ` (${count})` : ''}
        </Link>
      ) : null}
      <a className='sticky-call__phone' href={telHref}>
        Подзвонити
      </a>
    </div>
  );
}
