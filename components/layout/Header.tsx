'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useId, useRef, useState, type MouseEvent } from 'react';
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

function stripPath(href: string): string {
  const noHash = href.split('#')[0] ?? href;
  const noQuery = noHash.split('?')[0] ?? noHash;
  return noQuery || '/';
}

function hrefHash(href: string): string | null {
  const i = href.indexOf('#');
  return i >= 0 ? href.slice(i) : null;
}

function itemMatches(pathname: string, href: string): boolean {
  // Hash/CTA links (e.g. /salon#callback) are actions — never marked is-active.
  if (hrefHash(href)) return false;
  const path = stripPath(href);
  if (path === '/') return pathname === '/';
  return pathname === path || pathname.startsWith(`${path}/`);
}

/** Most specific matching nav item wins (longest path). Path section beats hash CTA. */
function isActive(pathname: string, href: string, nav: MenuItem[]): boolean {
  if (!itemMatches(pathname, href)) return false;
  const matching = nav.filter((item) => itemMatches(pathname, item.href));
  matching.sort((a, b) => stripPath(b.href).length - stripPath(a.href).length);
  return matching[0]?.href === href;
}

function preferredScrollBehavior(): ScrollBehavior {
  if (typeof window === 'undefined') return 'smooth';
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';
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
  const showCart = zone === 'shop';
  const drawerId = useId();
  const drawerRef = useRef<HTMLDivElement>(null);
  const closeBtnRef = useRef<HTMLButtonElement>(null);
  const bookHref = zone === 'salon' ? `${pathname.split('?')[0]}#callback` : null;
  const currentCleanPath = pathname.split('?')[0].replace(/\/$/, '') || '/';
  const isShopOrCart = currentCleanPath === '/shop' || currentCleanPath === '/cart' || currentCleanPath === '/store';
  const consultHref = isShopOrCart ? '/shop#contacts' : null;
  const zoneLabel = zone === 'shop' ? 'Магазин' : zone === 'salon' ? 'Салон' : null;
  const closeMenu = () => setOpen(false);


  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!open) return;
    const onHash = () => setOpen(false);
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, [open]);

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

  /** Same-page smooth scroll to hash (#callback, #contacts); returns true if handled. */
  function trySmoothScroll(event: MouseEvent<HTMLAnchorElement>, href: string): boolean {
    const itemHash = hrefHash(href);
    if (!itemHash) return false;
    const targetPath = stripPath(href);
    const currentPath = pathname.split('?')[0] || '/';
    if (currentPath !== targetPath) return false;
    const targetId = itemHash.slice(1);
    const el = document.getElementById(targetId) || (targetId === 'contacts' ? document.querySelector('.by-footer') : null);
    if (!el) return false;
    event.preventDefault();
    const headerEl = document.querySelector('.header');
    const headerH = headerEl instanceof HTMLElement ? headerEl.getBoundingClientRect().height : 64;
    const gap = 24;
    const top = el.getBoundingClientRect().top + window.scrollY - headerH - gap;
    window.scrollTo({ top: Math.max(0, top), behavior: preferredScrollBehavior() });
    const next = `${currentPath}${itemHash}`;
    if (window.location.hash !== itemHash) {
      window.history.pushState(null, '', next);
    } else {
      window.history.replaceState(null, '', next);
    }
    closeMenu();
    return true;
  }

  function trySmoothToCallback(event: MouseEvent<HTMLAnchorElement>, href: string): boolean {
    return trySmoothScroll(event, href);
  }

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
            <Link
              key={item.id}
              href={item.href}
              className={isActive(pathname, item.href, nav) ? 'is-active' : undefined}
              aria-current={isActive(pathname, item.href, nav) ? 'page' : undefined}
              onClick={(e) => {
                if (trySmoothToCallback(e, item.href)) return;
                // Path-only link: drop leftover #callback so Послуги stays active
                if (!hrefHash(item.href) && window.location.hash) {
                  const target = stripPath(item.href);
                  const current = pathname.split('?')[0] || '/';
                  if (target === current || current.startsWith(`${target}/`) || target.startsWith(`${current}/`)) {
                    window.history.pushState(null, '', target);
                  }
                }
              }}
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
          {bookHref ? (
            <Link
              href={bookHref}
              className='by-header__book'
              onClick={(e) => {
                trySmoothToCallback(e, bookHref);
              }}
            >
              Записатись
            </Link>
          ) : null}
          {consultHref ? (
            <Link
              href={consultHref}
              className='by-header__book'
              onClick={(e) => {
                trySmoothScroll(e, consultHref);
              }}
            >
              Консультація
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

      <button
        type='button'
        className={`by-drawer__overlay${open ? ' is-open' : ''}`}
        aria-label='Закрити меню'
        aria-hidden={!open}
        tabIndex={open ? 0 : -1}
        onClick={closeMenu}
      />

      <div
        id={drawerId}
        ref={drawerRef}
        className={`by-drawer${open ? ' is-open' : ''}`}
        role='dialog'
        aria-modal={open}
        aria-label='Меню'
        aria-hidden={!open}
        inert={!open ? true : undefined}
      >
        <div className='by-drawer__top'>
          <BrandMark />
          <button
            ref={closeBtnRef}
            type='button'
            className='by-drawer__close'
            onClick={closeMenu}
            aria-label='Закрити меню'
            tabIndex={open ? 0 : -1}
          >
            <X aria-hidden size={22} strokeWidth={1.75} />
          </button>
        </div>
        <nav className='by-drawer__nav' aria-label='Мобільне меню'>
          {nav.map((item) => (
            <Link
              key={item.id}
              href={item.href}
              className={isActive(pathname, item.href, nav) ? 'is-active' : undefined}
              aria-current={isActive(pathname, item.href, nav) ? 'page' : undefined}
              onClick={(e) => {
                if (trySmoothToCallback(e, item.href)) return;
                if (!hrefHash(item.href) && window.location.hash) {
                  const target = stripPath(item.href);
                  window.history.pushState(null, '', target);
                }
                closeMenu();
              }}
              tabIndex={open ? undefined : -1}
            >
              {item.label}
            </Link>
          ))}
        </nav>
        {settings.hours ? <p className='by-drawer__hours'>{settings.hours}</p> : null}
        <a className='by-drawer__phone' href={telHref} tabIndex={open ? undefined : -1}>
          {phone.display}
        </a>
        {bookHref ? (
          <Link
            href={bookHref}
            className='by-btn by-drawer__cta'
            onClick={(e) => {
              if (!trySmoothToCallback(e, bookHref)) closeMenu();
            }}
            tabIndex={open ? undefined : -1}
          >
            Записатись
          </Link>
        ) : null}
        {consultHref ? (
          <Link
            href={consultHref}
            className='by-btn by-drawer__cta'
            onClick={(e) => {
              if (!trySmoothScroll(e, consultHref)) closeMenu();
            }}
            tabIndex={open ? undefined : -1}
          >
            Консультація
          </Link>
        ) : null}
        {showCart ? (
          <Link href='/cart' className='by-btn by-btn--ghost by-drawer__cta' onClick={closeMenu} tabIndex={open ? undefined : -1}>
            Кошик{count ? ` (${count})` : ''}
          </Link>
        ) : null}
        {settings.social?.length ? (
          <div className='by-drawer__social'>
            {settings.social.map((link) => (
              <a
                key={link.id}
                href={link.url}
                target='_blank'
                rel='noreferrer'
                aria-label={link.type}
                tabIndex={open ? undefined : -1}
              >
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
    </>
  );
}
