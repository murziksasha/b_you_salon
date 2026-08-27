import type { Metadata } from 'next';
import { PageFrame } from '@/components/layout/SiteShell';
import { SectionRenderer } from '@/components/sections/SectionRenderer';
import { collectHeroImages } from '@/lib/hero-images';
import { getSiteData } from '@/lib/site-data';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const data = await getSiteData();
  const page = data.pages.find((p) => p.slug === 'salon' && p.visible);
  return {
    title: page?.title || 'Салон краси',
    description: page?.description || data.settings.description,
  };
}

export default async function SalonPage() {
  const data = await getSiteData();
  const page = data.pages.find((p) => p.slug === 'salon' && p.visible);
  if (!page) {
    return (
      <section className='by-section'>
        <div className='by-wrap'>
          <h1 className='by-section__title'>Салон краси</h1>
          <p>Сторінку салону ще не опубліковано.</p>
        </div>
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
        heroImages={collectHeroImages(data)}
      />
    </PageFrame>
  );
}
