'use client';

import Link from 'next/link';
import { showToast } from './AdminToast';

export function EmergencyOpsPanel() {
  return (
    <div className='admin-card'>
      <h2 className='admin-h2'>Якщо форми не доходять / сайт «мовчить»</h2>
      <ol className='admin-checklist'>
        <li>
          <strong>1. Health</strong> —{' '}
          <Link href='/admin'>Dashboard → Live health</Link>
        </li>
        <li>
          <strong>2. Тест SMTP</strong> — кнопка на Dashboard (або нижче)
          <div className='admin-row admin-mt'>
            <button
              type='button'
              className='admin-btn admin-btn--secondary'
              onClick={async () => {
                try {
                  const res = await fetch('/api/smtp-test', { method: 'POST' });
                  const j = (await res.json().catch(() => ({}))) as { error?: string; to?: string };
                  if (!res.ok) showToast(j.error || 'SMTP fail', 'error');
                  else showToast(`Лист → ${j.to || 'MAIL_TO'}`, 'success');
                } catch {
                  showToast('Мережа', 'error');
                }
              }}
            >
              Тест SMTP
            </button>
          </div>
        </li>
        <li>
          <strong>3. Ops alerts → Telegram</strong>
          <div className='admin-row admin-mt'>
            <button
              type='button'
              className='admin-btn admin-btn--secondary'
              onClick={async () => {
                try {
                  const res = await fetch('/api/ops-alerts', { method: 'POST' });
                  const j = (await res.json().catch(() => ({}))) as { sent?: string[] };
                  showToast(
                    j.sent?.length ? `Sent: ${j.sent.join(', ')}` : 'Немає алертів / throttle',
                    'success',
                  );
                } catch {
                  showToast('Мережа', 'error');
                }
              }}
            >
              Запустити ops-alerts
            </button>
          </div>
        </li>
        <li>
          <strong>4. Backup</strong> —{' '}
          <Link href='/admin/settings'>Налаштування → Backup</Link>: snapshot / export JSON
        </li>
        <li>
          <strong>5. Restore</strong> — лише owner, після pre-restore snapshot
        </li>
        <li>
          <strong>6. Журнали</strong> — заявки/замовлення в{' '}
          <Link href='/admin/inbox'>Inbox</Link> навіть без SMTP
        </li>
      </ol>

      <h2 className='admin-h2'>Секрети (runbook)</h2>
      <ul className='admin-checklist'>
        <li>
          <code>ADMIN_PASSWORD</code> / <code>SESSION_SECRET</code> — зміна → усі сесії скидаються
        </li>
        <li>
          2FA: Налаштування → TOTP; або <code>ADMIN_TOTP_SECRET</code> у .env
        </li>
        <li>
          <code>BACKUP_CRON_SECRET</code> — для cron backup + ops-alerts
        </li>
        <li>
          Не комітити <code>.env</code>; off-site копія <code>data/</code> + uploads
        </li>
      </ul>

      <h2 className='admin-h2'>Процес лідів (SOP)</h2>
      <ol className='admin-checklist'>
        <li>Нова → «Взяв у роботу» (assignee)</li>
        <li>Дзвінок → called / no_answer + snooze</li>
        <li>Закриття: outcome + нотатка обовʼязково</li>
        <li>Повторний номер → картка клієнта перед дзвінком</li>
        <li>Кінець дня → handoff digest</li>
      </ol>
    </div>
  );
}
