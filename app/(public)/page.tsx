import type { Metadata } from 'next';
import { PageFrame } from '@/components/layout/SiteShell';
import { SectionRenderer } from '@/components/sections/SectionRenderer';
import { collectHeroImages } from '@/lib/hero-images';
import { getSiteData } from '@/lib/site-data';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const data = await getSiteData();
  const page =
    data.pages.find((p) => p.slug === '' && p.visible) ?? data.pages.find((p) => p.id === 'home');
  const title = page?.title || data.settings.title;
  const description = page?.description || data.settings.description;
  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: 'website',
      images: data.settings.logo ? [{ url: data.settings.logo }] : undefined,
    },
  };
}

export default async function HomePage() {
  const data = await getSiteData();
  const page =
    data.pages.find((p) => p.slug === '' && p.visible) ?? data.pages.find((p) => p.id === 'home');
  const heroImages = collectHeroImages(data);

  if (!page) {
    return (
      <section className='not-found wrapper'>
        <p className='not-found__code'>404</p>
        <h1 className='not-found__title _title'>Сторінку не знайдено</h1>
        <p className='not-found__text _paragr'>Головну сторінку не налаштовано в CMS.</p>
      </section>
    );
  }

  return (
    <PageFrame titleSize={page.titleSize} textScale={page.textScale}>
      <SectionRenderer
        sections={page.sections}
        servicesNav={data.servicesNav}
        products={data.goods.filter((g) => g.visible)}
        services={data.services || []}
        reviewsUrl={data.settings.reviewsUrl}
        settings={data.settings}
        heroImages={heroImages}
      />
    </PageFrame>
  );
}
