import { AdminShell } from '@/components/admin/AdminShell';
import { ActivityPanel } from '@/components/admin/ActivityPanel';

export const dynamic = 'force-dynamic';

export default function AdminActivityPage() {
  return (
    <AdminShell>
      <h1>Активність</h1>
      <p className='admin-hint admin-mb-lg'>Журнал дій в адмінці (login, save, статуси, telegram…).</p>
      <ActivityPanel />
    </AdminShell>
  );
}
