import { AdminShell } from '@/components/admin/AdminShell';
import { LeadsPanel } from '@/components/admin/LeadsPanel';

export const dynamic = 'force-dynamic';

export default function AdminLeadsPage() {
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
