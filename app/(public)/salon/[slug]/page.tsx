import { notFound } from 'next/navigation';
import { PageFrame } from '@/components/layout/SiteShell';
import { SectionRenderer } from '@/components/sections/SectionRenderer';
import { newSection } from '@/lib/section-factory';
import { collectHeroImages } from '@/lib/hero-images';
import { getSiteData } from '@/lib/site-data';
import type { Section } from '@/lib/types';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: PageProps) {
  const { slug } = await params;
  const data = await getSiteData();
  const page = data.pages.find((p) => p.slug === slug && p.visible);
  const service = (data.services || []).find((s) => s.slug === slug && s.visible);
  if (!page && !service) return { title: 'Не знайдено' };
  return {
    title: page?.title || service?.title,
    description: page?.description || service?.description,
  };
}

export default async function SalonServicePage({ params }: PageProps) {
  const { slug } = await params;
  const data = await getSiteData();
  const page = data.pages.find((p) => p.slug === slug && p.visible);
  const service = (data.services || []).find((s) => s.slug === slug && s.visible);
  if (!page && !service) notFound();

  const fallback: Section[] = service
    ? [
        {
          ...(newSection('hero') as Extract<Section, { type: 'hero' }>),
          titleHtml: service.title,
          aboutLines: [service.description],
          image: service.image,
          imageAlt: service.title,
          callbackTitle: 'Записатись',
          callbackButtonText: 'Записатись',
          activeServiceSlug: service.slug,
        },
        {
          ...(newSection('price-list') as Extract<Section, { type: 'price-list' }>),
          source: 'catalog',
          category: service.category,
        },
        {
          ...(newSection('callback') as Extract<Section, { type: 'callback' }>),
          title: 'Залиште номер — узгодимо час',
          activeServiceId: service.id,
        },
        newSection('zone-door'),
      ]
    : [];

  const sections = page?.sections?.length ? page.sections : fallback;

  return (
    <PageFrame titleSize={page?.titleSize} textScale={page?.textScale}>
      <SectionRenderer
        sections={sections}
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
