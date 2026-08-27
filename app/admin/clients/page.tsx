import { AdminShell } from '@/components/admin/AdminShell';
import { ClientProfile } from '@/components/admin/ClientProfile';

export const dynamic = 'force-dynamic';

export default async function AdminClientsPage({
  searchParams,
}: {
  searchParams: Promise<{ phone?: string }>;
}) {
  const sp = await searchParams;
  return (
    <AdminShell>
      <h1>Клієнт</h1>
      <p className='admin-hint admin-mb-lg'>
        Картка за номером телефону: історія заявок і замовлень, статуси, UTM, нотатки.
      </p>
      <ClientProfile initialPhone={sp.phone || ''} />
    </AdminShell>
  );
}
