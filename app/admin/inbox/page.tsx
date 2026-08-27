import { AdminShell } from '@/components/admin/AdminShell';
import { InboxPanel } from '@/components/admin/InboxPanel';

export const dynamic = 'force-dynamic';

export default async function AdminInboxPage({
  searchParams,
}: {
  searchParams: Promise<{ phone?: string; filter?: string }>;
}) {
  const sp = await searchParams;
  return (
    <AdminShell>
      <h1>Inbox</h1>
      <p className='admin-hint admin-mb-lg'>
        Єдина черга заявок і замовлень: статуси, SLA, шаблони відповідей, історія по телефону, live SSE.
      </p>
      <InboxPanel initialPhone={sp.phone || ''} initialFilter={sp.filter || ''} />
    </AdminShell>
  );
}
