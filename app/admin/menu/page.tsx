import { AdminShell } from '@/components/admin/AdminShell';
import { MenuEditor } from '@/components/admin/MenuEditor';
import { getSiteData } from '@/lib/site-data';

export const dynamic = 'force-dynamic';

export default async function AdminMenuPage() {
  const site = await getSiteData();
  return (
    <AdminShell>
      <h1>Меню</h1>
      <p className='admin-hint admin-mb-lg'>
        Пункти головного меню сайту. Перетягуйте за ⠿, Ctrl+S — зберегти.
      </p>
      <MenuEditor initialData={site} />
    </AdminShell>
  );
}