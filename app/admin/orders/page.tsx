import { AdminShell } from '@/components/admin/AdminShell';
import { OrdersPanel } from '@/components/admin/OrdersPanel';

export const dynamic = 'force-dynamic';

export default function AdminOrdersPage() {
  return (
    <AdminShell>
      <h1>Замовлення</h1>
      <p className='admin-hint admin-mb-lg'>
        Замовлення з магазину (сторінка товару). Зберігаються у <code>data/orders.json</code> навіть без
        SMTP. Снапшот назви/ціни/коду — на момент замовлення.
      </p>
      <OrdersPanel />
    </AdminShell>
  );
}
