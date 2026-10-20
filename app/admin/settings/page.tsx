import { requirePageAccess } from '@/lib/admin/page-guard';
import { roleCan } from '@/lib/admin-roles';
import { AdminShell } from '@/components/admin/AdminShell';
import { SettingsEditor } from '@/components/admin/SettingsEditor';
import { getSiteData } from '@/lib/site-data';

export const dynamic = 'force-dynamic';

export default async function AdminSettingsPage() {
  const access = await requirePageAccess('/admin/settings');
  const site = await getSiteData();
  const canEditSite = roleCan(access.role, 'settings', access.grants);
  return (
    <AdminShell>
      <h1>Налаштування сайту</h1>
      <p className='admin-hint admin-mb-lg'>
        {canEditSite
          ? 'Логотип, контакти, SEO і ваш особистий 2FA. Для логотипу завантажуйте PNG — формат збережеться без WebP.'
          : 'Тут лише ваш особистий 2FA. Код власника на цей обліковий запис не діє.'}
      </p>
      <SettingsEditor initialData={site} />
    </AdminShell>
  );
}