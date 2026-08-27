import { AdminShell } from '@/components/admin/AdminShell';
import { PageConstructor } from '@/components/admin/PageConstructor';
import { getSiteData } from '@/lib/site-data';
import { notFound } from 'next/navigation';

export const dynamic = 'force-dynamic';

interface Props {
  params: Promise<{ slug: string }>;
}

export default async function AdminPageEditor({ params }: Props) {
  const { slug } = await params;
  const site = await getSiteData();
  const pageSlug = slug === 'home' ? '' : slug;
  const page = site.pages.find((p) => p.slug === pageSlug);

  if (!page) notFound();

  return (
    <AdminShell>
      <h1>Конструктор: {page.title || 'Головна'}</h1>
      <p className='admin-hint admin-mb-lg'>
        Редагуйте секції, перетягуйте їх порядок. Збереження — Ctrl+S. Прев’ю справа на широкому екрані.
      </p>
      <PageConstructor initialData={site} pageSlug={pageSlug} />
    </AdminShell>
  );
}