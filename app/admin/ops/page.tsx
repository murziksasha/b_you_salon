import { AdminShell } from '@/components/admin/AdminShell';
import { EmergencyOpsPanel } from '@/components/admin/EmergencyOpsPanel';

export const dynamic = 'force-dynamic';

export default function AdminOpsPage() {
  return (
    <AdminShell>
      <h1>Ops · runbook</h1>
      <p className='admin-hint admin-mb-lg'>
        Аварійні кроки, коли форми/сайт/листи «лежать». Секрети — лише через env / ротацію.
      </p>
      <EmergencyOpsPanel />
    </AdminShell>
  );
}
