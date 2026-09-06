import { BreadcrumbJsonLd } from '@/components/seo/BreadcrumbJsonLd';
import { ShopCatalog } from '@/components/shop/ShopCatalog';
import { SectionRenderer } from '@/components/sections/SectionRenderer';
import { ZoneDoorSection } from '@/components/sections/ZoneDoorSection';
import { zoneDoorToSalon } from '@/lib/default-site-data';
import { requestSiteUrl } from '@/lib/request-site-url';
import { buildPublicMetadata, shareImageFromSettings } from '@/lib/seo-metadata';
import { getProducts, getSiteData } from '@/lib/site-data';
import { parseProductSort } from '@/lib/shop-catalog';
import type { ZoneDoorSection as ZoneDoorSectionType } from '@/lib/types';

export const dynamic = 'force-dynamic';

export async function generateMetadata() {
  const data = await getSiteData();
  const page = data.pages.find((p) => p.slug === 'shop' && p.visible);
  const title = page?.title || 'Магазин косметики';
  const description =
    page?.description?.replace(/\r?\n+/g, ' ') ||
    data.settings.description ||
    'Каталог косметики B_You';
  return buildPublicMetadata(
    {
      title,
      description,
      path: '/shop',
      image: shareImageFromSettings(data.settings),
    },
    await requestSiteUrl(),
  );
}

interface PageProps {
  searchParams: Promise<{ q?: string; sort?: string; category?: string }>;
}

export default async function ShopPage({ searchParams }: PageProps) {
  const [data, products, sp] = await Promise.all([getSiteData(), getProducts(), searchParams]);
  const initialQuery = typeof sp.q === 'string' ? sp.q : '';
  const initialSort = parseProductSort(typeof sp.sort === 'string' ? sp.sort : undefined);
  const initialCategory = typeof sp.category === 'string' ? sp.category : '';

  const shopPage = data.pages.find((p) => p.slug === 'shop' && p.visible);
  const door = zoneDoorToSalon() as ZoneDoorSectionType;
  const extraSections = (shopPage?.sections || []).filter((s) => s.visible && s.type !== 'hero');
  const siteUrl = await requestSiteUrl();

  return (
    <>
      <BreadcrumbJsonLd
        siteUrl={siteUrl}
        items={[
          { name: 'Головна', path: '/' },
          { name: shopPage?.title || 'Магазин косметики', path: '/shop' },
        ]}
      />
      <section className='shop-page by-section'>
        <div className='by-wrap'>
          {(() => {
            const rawDesc =
              shopPage?.description ||
              'Твоя краса заслуговує на найкраще! Обирай свій ідеальний догляд, дозволь собі розкіш бути щасливою і насолоджуйся результатом!\nСамовивіз у м. Чорноморськ, Вишнева 4 або доставка за домовленністю';
            const [slogan, ...rest] = rawDesc.split('\n');
            const delivery = rest.join('\n').trim();
            return (
              <header className='shop-page__intro shop-page__intro--hero'>
                <h1 className='shop-page__title by-section__title'>{shopPage?.title || 'Магазин косметики'}</h1>
                {slogan ? <p className='shop-page__slogan'>{slogan.trim()}</p> : null}
                {delivery ? (
                  <p className='shop-page__delivery'>
                    <span className='shop-page__delivery-icon' aria-hidden='true'>✨</span>
                    <span>{delivery}</span>
                  </p>
                ) : null}
              </header>
            );
          })()}
          <ShopCatalog
            products={products}
            initialQuery={initialQuery}
            initialSort={initialSort}
            initialCategory={initialCategory}
          />
        </div>
      </section>
      {extraSections.length ? (
        <SectionRenderer
          sections={extraSections}
          servicesNav={[]}
          products={products}
          services={[]}
          settings={data.settings}
        />
      ) : null}
      <ZoneDoorSection section={door} />
    </>
  );
}
