import { AdminShell } from '@/components/admin/AdminShell';
import { SettingsEditor } from '@/components/admin/SettingsEditor';
import { getSiteData } from '@/lib/site-data';

export const dynamic = 'force-dynamic';

export default async function AdminSettingsPage() {
  const site = await getSiteData();
  return (
    <AdminShell>
      <h1>Налаштування сайту</h1>
      <p className='admin-hint admin-mb-lg'>
        Логотип, контакти, SEO, 2FA. Для логотипу завантажуйте PNG — формат збережеться без WebP.
      </p>
      <SettingsEditor initialData={site} />
    </AdminShell>
  );
}