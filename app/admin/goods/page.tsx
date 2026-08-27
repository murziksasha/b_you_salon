import { AdminShell } from '@/components/admin/AdminShell';
import { GoodsEditor } from '@/components/admin/GoodsEditor';
import { getSiteData } from '@/lib/site-data';

export const dynamic = 'force-dynamic';

export default async function AdminGoodsPage() {
  const site = await getSiteData();
  return (
    <AdminShell>
      <h1>Товари</h1>
      <p className='admin-hint admin-mb-lg'>
        Каталог магазину. Збереження — Ctrl+S. Порядок у списку можна змінювати перетягуванням.
      </p>
      <GoodsEditor initialData={site} />
    </AdminShell>
  );
}