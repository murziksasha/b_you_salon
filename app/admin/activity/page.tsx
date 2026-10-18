import { requirePageAccess } from '@/lib/admin/page-guard';
import { AdminShell } from '@/components/admin/AdminShell';
import { ActivityPanel } from '@/components/admin/ActivityPanel';

export const dynamic = 'force-dynamic';

export default async function AdminActivityPage() {
  await requirePageAccess('/admin/activity');
  return (
    <AdminShell>
      <h1>Активність</h1>
      <p className='admin-hint admin-mb-lg'>Журнал дій в адмінці (login, save, статуси, telegram…).</p>
      <ActivityPanel />
    </AdminShell>
  );
}
