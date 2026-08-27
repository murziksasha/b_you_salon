import { notFound } from 'next/navigation';
import { PageFrame } from '@/components/layout/SiteShell';
import { SectionRenderer } from '@/components/sections/SectionRenderer';
import { sanitizeHtml } from '@/lib/sanitize';
import { collectHeroImages } from '@/lib/hero-images';
import { getSiteData } from '@/lib/site-data';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ slug: string }>;
}

export async function generateStaticParams() {
  const data = await getSiteData();
  return data.pages
    .filter((page) => page.slug && page.visible)
    .map((page) => ({ slug: page.slug }));
}

export async function generateMetadata({ params }: PageProps) {
  const { slug } = await params;
  const data = await getSiteData();
  const page = data.pages.find((p) => p.slug === slug && p.visible);
  if (!page) return { title: 'Не знайдено' };
  const description = page.description || data.settings.description;
  return {
    title: page.title,
    description,
    openGraph: {
      title: page.title,
      description,
      type: 'website',
    },
  };
}

export default async function SlugPage({ params }: PageProps) {
  const { slug } = await params;
  const data = await getSiteData();
  const page = data.pages.find((p) => p.slug === slug && p.visible);

  if (!page || page.zone === 'salon' || slug === 'shop' || slug === 'salon') {
    notFound();
  }

  const heroImages = collectHeroImages(data);

  if (page.contentHtml?.trim()) {
    return (
      <PageFrame titleSize={page.titleSize} textScale={page.textScale}>
        <article className='content-page wrapper'>
          <h1 className='content-page__title _title'>{page.title}</h1>
          <div
            className='content-page__body'
            dangerouslySetInnerHTML={{ __html: sanitizeHtml(page.contentHtml) }}
          />
        </article>
      </PageFrame>
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
