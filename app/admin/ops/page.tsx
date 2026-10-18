import { requirePageAccess } from '@/lib/admin/page-guard';
import { AdminShell } from '@/components/admin/AdminShell';
import { EmergencyOpsPanel } from '@/components/admin/EmergencyOpsPanel';
import { TelegramBotPanel } from '@/components/admin/TelegramBotPanel';

export const dynamic = 'force-dynamic';

export default async function AdminOpsPage() {
  await requirePageAccess('/admin/ops');
  return (
    <AdminShell>
      <h1>Ops · runbook</h1>
      <p className='admin-hint admin-mb-lg'>
        Аварійні кроки, коли форми/сайт/листи «лежать». Секрети — лише через env / ротацію.
      </p>
      <TelegramBotPanel />
      <EmergencyOpsPanel />
    </AdminShell>
  );
}
