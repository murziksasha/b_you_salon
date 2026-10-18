import { requirePageAccess } from '@/lib/admin/page-guard';
import { AdminShell } from '@/components/admin/AdminShell';
import { LeadsPanel } from '@/components/admin/LeadsPanel';

export const dynamic = 'force-dynamic';

export default async function AdminLeadsPage() {
  await requirePageAccess('/admin/leads');
  return (
    <AdminShell>
      <h1>Заявки</h1>
      <p className='admin-hint admin-mb-lg'>
        Журнал дзвінків з форми на сайті. Зберігається у <code>data/leads.json</code> навіть без SMTP.
      </p>
      <LeadsPanel />
    </AdminShell>
  );
}
