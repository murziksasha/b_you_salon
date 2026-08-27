import { notFound } from 'next/navigation';
import { promises as fs } from 'fs';
import path from 'path';
import { SectionRenderer } from '@/components/sections/SectionRenderer';
import { getSiteData } from '@/lib/site-data';
import type { Page } from '@/lib/types';
import { sanitizeHtml } from '@/lib/sanitize';

export const dynamic = 'force-dynamic';

function dataRoot(): string {
  return process.env.DATA_DIR || path.join(process.cwd(), 'data');
}

async function loadPreviewPage(token: string): Promise<Page | null> {
  const safe = token.replace(/[^a-zA-Z0-9_-]/g, '');
  if (!safe) return null;
  try {
    const raw = await fs.readFile(path.join(dataRoot(), 'previews', `${safe}.json`), 'utf-8');
    const parsed = JSON.parse(raw) as { page?: Page };
    return parsed.page || null;
  } catch {
    return null;
  }
}

export default async function AdminLivePreviewPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const page = await loadPreviewPage(token);
  if (!page) notFound();

  const site = await getSiteData();
  const contentHtml = page.contentHtml?.trim();

  return (
    <div className='admin-live-preview' data-preview-token={token}>
      <div className='admin-live-preview__banner' role='status'>
        LIVE PREVIEW (не опубліковано) · {page.title}
      </div>
      {contentHtml ? (
        <div
          className='wrapper'
          dangerouslySetInnerHTML={{ __html: sanitizeHtml(contentHtml) }}
        />
      ) : (
        <SectionRenderer
          sections={page.sections || []}
          settings={site.settings}
          servicesNav={site.servicesNav}
          products={site.goods.filter((g) => g.visible)}
          reviewsUrl={site.settings.reviewsUrl}
        />
      )}
    </div>
  );
}
