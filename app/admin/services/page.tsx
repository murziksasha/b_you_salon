import { AdminShell } from '@/components/admin/AdminShell';
import { ServicesEditor } from '@/components/admin/ServicesEditor';
import { getSiteData } from '@/lib/site-data';

export const dynamic = 'force-dynamic';

export default async function AdminServicesPage() {
  const site = await getSiteData();
  return (
    <AdminShell>
      <h1>Послуги салону</h1>
      <p className='admin-hint admin-mb-lg'>
        Каталог послуг окремо від товарів магазину. Публічні лендінги — <code>/salon/slug</code>.
      </p>
      <ServicesEditor initialData={site} />
    </AdminShell>
  );
}
