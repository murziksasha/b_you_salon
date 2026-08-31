import { ShopCatalog } from '@/components/shop/ShopCatalog';
import { SectionRenderer } from '@/components/sections/SectionRenderer';
import { ZoneDoorSection } from '@/components/sections/ZoneDoorSection';
import { zoneDoorToSalon } from '@/lib/default-site-data';
import { getProducts, getSiteData } from '@/lib/site-data';
import { parseProductSort } from '@/lib/shop-catalog';
import type { ZoneDoorSection as ZoneDoorSectionType } from '@/lib/types';

export const dynamic = 'force-dynamic';

export async function generateMetadata() {
  const data = await getSiteData();
  const description = data.settings.description || 'Каталог косметики B_You';
  return {
    title: 'Магазин косметики',
    description,
    openGraph: {
      title: 'Магазин косметики | B_You',
      description,
      type: 'website',
    },
  };
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

  return (
    <>
      <section className='shop-page by-section'>
        <div className='by-wrap'>
          <header className='shop-page__intro'>
            <p className='by-kicker'>Ліворуч від входу</p>
            <h1 className='shop-page__title by-section__title'>{shopPage?.title || 'Магазин косметики'}</h1>
            <p className='shop-page__subtitle by-section__sub'>
              {shopPage?.description ||
                'Додайте товари в кошик. Відтінок або об’єм вкажіть у коментарі до замовлення.'}
            </p>
          </header>
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
