'use client';

import {
  formatCountdown,
  parseRetryAfterFromBody,
  rateLimitMessage,
} from '@/lib/admin/rateLimitUi';
import { safeAdminReturnPath } from '@/lib/admin-paths';
import { BrandMark } from '@/components/brand/BrandMark';
import { useSearchParams } from 'next/navigation';
import { FormEvent, useEffect, useState } from 'react';

export function LoginForm() {
  const searchParams = useSearchParams();
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [lockSeconds, setLockSeconds] = useState(0);
  const [needTotp, setNeedTotp] = useState(false);

  useEffect(() => {
    if (lockSeconds <= 0) return;
    setError(rateLimitMessage(lockSeconds, 'login'));
    const id = window.setTimeout(() => {
      setLockSeconds((s) => {
        const next = s - 1;
        if (next <= 0) {
          setError('');
          return 0;
        }
        return next;
      });
    }, 1000);
    return () => window.clearTimeout(id);
  }, [lockSeconds]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (lockSeconds > 0 || loading) return;

    setLoading(true);
    setError('');

    const formData = new FormData(event.currentTarget);
    const password = String(formData.get('password') ?? '');
    const username = String(formData.get('username') ?? '');
    const totp = String(formData.get('totp') ?? '');

    try {
      const res = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          password,
          username: username || undefined,
          totp: totp || undefined,
        }),
        credentials: 'same-origin',
      });

      if (!res.ok) {
        if (res.status === 429) {
          const seconds = await parseRetryAfterFromBody(res, 60);
          setLockSeconds(seconds);
          setError(rateLimitMessage(seconds, 'login'));
          setLoading(false);
          return;
        }
        const json = (await res.json().catch(() => ({}))) as {
          error?: string;
          needTotp?: boolean;
        };
        if (json.needTotp) setNeedTotp(true);
        setError(
          res.status === 503
            ? 'ADMIN_PASSWORD не налаштовано в .env — скопіюйте з .env.example і перезапустіть сервер'
            : res.status === 403
              ? 'Доступ заборонено з цієї IP-адреси'
              : json.needTotp
                ? 'Потрібен код 2FA (TOTP)'
                : json.error === 'Invalid 2FA code'
                  ? 'Невірний код 2FA'
                  : 'Невірний пароль',
        );
        setLoading(false);
        return;
      }

      window.location.assign(safeAdminReturnPath(searchParams.get('from')));
    } catch {
      setError('Помилка мережі. Спробуйте ще раз.');
      setLoading(false);
    }
  }

  const locked = lockSeconds > 0;

  return (
    <div className='admin-body admin-login'>
      <form onSubmit={handleSubmit} className='admin-login-card' aria-busy={loading}>
        <BrandMark href='/' className='admin-login-wordmark' />
        <p className='admin-login-brand'>Адмінка студії</p>
        <h1>Вхід до адмінки</h1>
        <label htmlFor='admin-username'>
          Логін <span className='admin-hint'>(опційно, multi-user)</span>
          <input
            id='admin-username'
            name='username'
            type='text'
            autoComplete='username'
            disabled={loading || locked}
          />
        </label>
        <label htmlFor='admin-password'>
          Пароль
          <input
            id='admin-password'
            type='password'
            name='password'
            required
            autoFocus
            autoComplete='current-password'
            disabled={loading || locked}
          />
        </label>
        <label htmlFor='admin-totp'>
          Код 2FA {needTotp ? '(обовʼязково)' : '(якщо увімкнено)'}
          <input
            id='admin-totp'
            type='text'
            name='totp'
            inputMode='numeric'
            autoComplete='one-time-code'
            pattern='[0-9]*'
            maxLength={6}
            placeholder='000000'
            disabled={loading || locked}
          />
        </label>
        <p className='admin-hint admin-login-2fa-hint'>
          2FA: <strong>Налаштування → Безпека</strong> (QR) або{' '}
          <code>ADMIN_TOTP_SECRET</code> у <code>.env</code>
        </p>
        {error ? (
          <p className='admin-login-error' role='alert' aria-live='assertive'>
            {error}
          </p>
        ) : null}
        {locked ? (
          <p className='admin-login-lock' role='status' aria-live='polite'>
            Повтор через <strong>{formatCountdown(lockSeconds)}</strong>
          </p>
        ) : null}
        <button type='submit' className='admin-btn admin-btn--block' disabled={loading || locked}>
          {loading ? 'Вхід…' : locked ? `Заблоковано (${formatCountdown(lockSeconds)})` : 'Увійти'}
        </button>
      </form>
    </div>
  );
}
