import type { MenuItem, SiteData, SiteSettings } from '@/lib/types';
import { LocalBusinessJsonLd } from '@/components/seo/LocalBusinessJsonLd';
import { CartProvider } from '@/components/cart/CartProvider';
import { Footer } from './Footer';
import { Header } from './Header';
import { PageUp } from './PageUp';
import { StickyCallBar } from './StickyCallBar';
import { ZoneRoot } from './ZoneRoot';

interface SiteShellProps {
  settings: SiteSettings;
  menu: MenuItem[];
  site: Pick<SiteData, 'headerMenu' | 'headerMenuSalon' | 'headerMenuShop'>;
  children: React.ReactNode;
}

export function SiteShell({ settings, menu, site, children }: SiteShellProps) {
  const siteUrl = process.env.SITE_URL?.replace(/\/$/, '') || undefined;

  return (
    <CartProvider>
      <ZoneRoot className='container'>
        <LocalBusinessJsonLd settings={settings} siteUrl={siteUrl} />
        <a className='skip-link' href='#main-content'>
          Перейти до вмісту
        </a>
        <Header settings={settings} menu={menu} site={site} />
        <main className='main' id='main-content'>
          {children}
        </main>
        <PageUp />
        <Footer settings={settings} />
        <StickyCallBar settings={settings} />
      </ZoneRoot>
    </CartProvider>
  );
}

export function PageFrame({
  titleSize,
  textScale,
  children,
}: {
  titleSize?: number;
  textScale?: number;
  children: React.ReactNode;
}) {
  const style: React.CSSProperties & Record<string, string | number> = {};
  if (titleSize) style['--title-size'] = `${titleSize}rem`;
  if (textScale) style['--text-scale'] = String(textScale);
  if (!titleSize && !textScale) return <>{children}</>;
  return <div style={style}>{children}</div>;
}
