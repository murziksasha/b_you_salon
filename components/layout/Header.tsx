'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useId, useRef, useState } from 'react';
import { Menu, ShoppingBag, X } from 'lucide-react';
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

const FOCUSABLE = 'a[href], button:not([disabled])';

function isActive(pathname: string, href: string): boolean {
  if (href === '/') return pathname === '/';
  return pathname === href || pathname.startsWith(`${href}/`);
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
  const drawerId = useId();
  const drawerRef = useRef<HTMLDivElement>(null);
  const closeBtnRef = useRef<HTMLButtonElement>(null);
  const bookHref = zone === 'salon' ? `${pathname.split('?')[0]}#callback` : null;
  const zoneLabel = zone === 'shop' ? 'Магазин' : zone === 'salon' ? 'Салон' : null;

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!open) {
      document.body.classList.remove('nav-open');
      return;
    }
    document.body.classList.add('nav-open');
    const previous = document.activeElement as HTMLElement | null;
    closeBtnRef.current?.focus();

    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setOpen(false);
        return;
      }
      if (event.key !== 'Tab') return;
      const root = drawerRef.current;
      if (!root) return;
      const nodes = [...root.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
        (el) => !el.hasAttribute('disabled') && el.tabIndex !== -1,
      );
      if (!nodes.length) return;
      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener('keydown', onKey);
    return () => {
      document.body.classList.remove('nav-open');
      document.removeEventListener('keydown', onKey);
      previous?.focus();
    };
  }, [open]);

  return (
    <>
    <header className='header'>
      <div className='by-header by-wrap'>
        <div className='by-header__brand'>
          <BrandMark />
          {zoneLabel ? <span className='by-header__kicker'>{zoneLabel}</span> : null}
        </div>
        <nav className='by-header__nav' aria-label='Головне меню'>
          {nav.map((item) => (
            <Link key={item.id} href={item.href} className={isActive(pathname, item.href) ? 'is-active' : undefined}>
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
          {bookHref ? (
            <Link href={bookHref} className='by-header__book'>
              Записатись
            </Link>
          ) : null}
          <a className='by-header__phone' href={telHref}>
            {phone.display}
          </a>
          <ThemeToggle className='by-header__theme' />
          <button
            type='button'
            className='by-burger'
            aria-expanded={open}
            aria-controls={drawerId}
            aria-label={open ? 'Закрити меню' : 'Відкрити меню'}
            onClick={() => setOpen((v) => !v)}
          >
            {open ? <X aria-hidden size={22} strokeWidth={1.75} /> : <Menu aria-hidden size={22} strokeWidth={1.75} />}
            <span className='by-burger__label'>{open ? 'Закрити' : 'Меню'}</span>
          </button>
        </div>
      </div>
    </header>

      {open ? (
        <button
          type='button'
          className='by-drawer__overlay'
          aria-label='Закрити меню'
          onClick={() => setOpen(false)}
        />
      ) : null}

      {open ? (
      <div
        id={drawerId}
        ref={drawerRef}
        className='by-drawer is-open'
        role='dialog'
        aria-modal='true'
        aria-label='Меню'
      >
        <div className='by-drawer__top'>
          <BrandMark />
          <button
            ref={closeBtnRef}
            type='button'
            className='by-drawer__close'
            onClick={() => setOpen(false)}
            aria-label='Закрити меню'
          >
            <X aria-hidden size={22} strokeWidth={1.75} />
          </button>
        </div>
        <nav className='by-drawer__nav' aria-label='Мобільне меню'>
          {nav.map((item) => (
            <Link key={item.id} href={item.href} className={isActive(pathname, item.href) ? 'is-active' : undefined}>
              {item.label}
            </Link>
          ))}
        </nav>
        {settings.hours ? <p className='by-drawer__hours'>{settings.hours}</p> : null}
        <a className='by-drawer__phone' href={telHref}>
          {phone.display}
        </a>
        {bookHref ? (
          <Link href={bookHref} className='by-btn by-drawer__cta'>
            Записатись
          </Link>
        ) : null}
        {showCart ? (
          <Link href='/cart' className='by-btn by-btn--ghost by-drawer__cta'>
            Кошик{count ? ` (${count})` : ''}
          </Link>
        ) : null}
        {settings.social?.length ? (
          <div className='by-drawer__social'>
            {settings.social.map((link) => (
              <a key={link.id} href={link.url} target='_blank' rel='noreferrer' aria-label={link.type}>
                {link.type}
              </a>
            ))}
          </div>
        ) : null}
        <div className='by-drawer__theme'>
          <span>Тема</span>
          <ThemeToggle />
        </div>
      </div>
      ) : null}
    </>
  );
}
