'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { ShoppingBag } from 'lucide-react';
import { BrandMark } from '@/components/brand/BrandMark';
import { useCart } from '@/components/cart/CartProvider';
import { ThemeToggle } from '@/components/layout/ThemeToggle';
import type { MenuItem, SiteData, SiteSettings } from '@/lib/types';
import { formatTelHref } from '@/lib/phone';
import { menuForZone, phoneForZone, zoneFromPath } from '@/lib/zone';

interface HeaderProps {
  settings: SiteSettings;
  menu: MenuItem[];
  site: Pick<SiteData, 'headerMenu' | 'headerMenuSalon' | 'headerMenuShop'>;
}

export function Header({ settings, menu, site }: HeaderProps) {
  const pathname = usePathname() || '/';
  const zone = zoneFromPath(pathname);
  const items = menuForZone({ ...site, settings, servicesNav: [], pages: [], goods: [] } as SiteData, zone);
  const nav = items.length ? items : menu.filter((i) => i.visible);
  const [open, setOpen] = useState(false);
  const phone = phoneForZone(settings, zone);
  const telHref = formatTelHref(phone.tel);
  const { count } = useCart();
  const showCart = zone === 'shop' || count > 0;

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  return (
    <header className='header'>
      <div className='by-header by-wrap'>
        <BrandMark />
        <nav className={`by-header__nav${open ? ' is-open' : ''}`} aria-label='Головне меню'>
          {nav.map((item) => (
            <Link
              key={item.id}
              href={item.href}
              className={pathname === item.href ? 'is-active' : undefined}
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <div className='by-header__actions'>
          {showCart ? (
            <Link href='/cart' className='by-header__cart' aria-label={`Кошик${count > 0 ? `, ${count}` : ''}`}>
              <ShoppingBag className='by-header__cart-icon' aria-hidden />
              {count > 0 ? <span className='by-header__cart-count'>{count}</span> : null}
            </Link>
          ) : null}
          <ThemeToggle className='by-header__theme' />
          <a className='by-header__phone' href={telHref}>
            {phone.display}
          </a>
          <button
            type='button'
            className='by-burger'
            aria-expanded={open}
            aria-label={open ? 'Закрити меню' : 'Відкрити меню'}
            onClick={() => setOpen((v) => !v)}
          >
            Меню
          </button>
        </div>
      </div>
    </header>
  );
}
