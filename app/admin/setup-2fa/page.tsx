import { TotpSetupPanel } from '@/components/admin/TotpSetupPanel';
import { AdminToastHost } from '@/components/admin/AdminToast';
import { AdminRoleProvider } from '@/components/admin/AdminRoleContext';
import { requirePageAccess } from '@/lib/admin/page-guard';

export const dynamic = 'force-dynamic';

/**
 * Forced enrollment destination for setupOnly sessions (env/owner without TOTP yet).
 * Reuses TotpSetupPanel; full admin chrome is intentionally omitted until 2FA is active.
 */
export default async function AdminSetup2faPage() {
  await requirePageAccess('/admin/setup-2fa');

  return (
    <AdminRoleProvider>
      <div className='admin-body admin-login'>
        <div className='admin-login-card admin-totp-forced-setup'>
          <p className='admin-login-brand'>Адмінка студії</p>
          <h1>Обовʼязкове налаштування 2FA</h1>
          <p className='admin-hint admin-mb'>
            Пароль прийнято. Увімкніть двофакторну автентифікацію, щоб відкрити адмінку.
          </p>
          <TotpSetupPanel />
        </div>
        <AdminToastHost />
      </div>
    </AdminRoleProvider>
  );
}
