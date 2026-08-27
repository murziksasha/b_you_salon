'use client';

import { useCallback, useEffect, useState } from 'react';
import { showToast } from './AdminToast';

type TotpSource = 'env' | 'file';

interface TotpStatus {
  enabled: boolean;
  source: TotpSource | null;
  managedByEnv: boolean;
  fileConfigured: boolean;
  enabledAt: string | null;
}

interface SetupDraft {
  secret: string;
  otpauthUrl: string;
  qrDataUrl: string;
}

type Phase = 'idle' | 'setup' | 'disable';

export function TotpSetupPanel() {
  const [status, setStatus] = useState<TotpStatus | null>(null);
  const [loadError, setLoadError] = useState('');
  const [phase, setPhase] = useState<Phase>('idle');
  const [draft, setDraft] = useState<SetupDraft | null>(null);
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/auth/totp', { cache: 'no-store', credentials: 'same-origin' });
      if (!res.ok) {
        setLoadError(res.status === 401 ? 'Потрібен вхід' : 'Не вдалося завантажити статус 2FA');
        return;
      }
      const json = (await res.json()) as TotpStatus;
      setStatus(json);
      setLoadError('');
    } catch {
      setLoadError('Мережева помилка');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function resetForm() {
    setPassword('');
    setCode('');
    setDraft(null);
    setPhase('idle');
    setCopied(false);
  }

  async function beginSetup() {
    if (!password.trim()) {
      showToast('Введіть пароль адмінки', 'error');
      return;
    }
    setBusy(true);
    try {
      const res = await fetch('/api/auth/totp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ action: 'begin', password }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        error?: string;
        secret?: string;
        otpauthUrl?: string;
        qrDataUrl?: string;
      };
      if (!res.ok) {
        showToast(json.error || 'Не вдалося почати setup', 'error');
        return;
      }
      if (!json.secret || !json.qrDataUrl || !json.otpauthUrl) {
        showToast('Неповна відповідь сервера', 'error');
        return;
      }
      setDraft({
        secret: json.secret,
        otpauthUrl: json.otpauthUrl,
        qrDataUrl: json.qrDataUrl,
      });
      setCode('');
      setPhase('setup');
      showToast('Відскануйте QR у Authenticator', 'success');
    } catch {
      showToast('Мережева помилка', 'error');
    } finally {
      setBusy(false);
    }
  }

  async function confirmSetup() {
    if (!draft) return;
    if (!password.trim() || !code.trim()) {
      showToast('Потрібні пароль і код 2FA', 'error');
      return;
    }
    setBusy(true);
    try {
      const res = await fetch('/api/auth/totp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({
          action: 'confirm',
          password,
          secret: draft.secret,
          code,
        }),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        showToast(
          json.error === 'Invalid 2FA code'
            ? 'Невірний код 2FA — перевірте час на телефоні'
            : json.error === 'Invalid password'
              ? 'Невірний пароль'
              : json.error || 'Не вдалося увімкнути 2FA',
          'error',
        );
        return;
      }
      showToast('2FA увімкнено', 'success');
      resetForm();
      await load();
    } catch {
      showToast('Мережева помилка', 'error');
    } finally {
      setBusy(false);
    }
  }

  async function disableTotp() {
    if (!password.trim() || !code.trim()) {
      showToast('Потрібні пароль і поточний код 2FA', 'error');
      return;
    }
    setBusy(true);
    try {
      const res = await fetch('/api/auth/totp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ action: 'disable', password, code }),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        showToast(
          json.error === 'Invalid 2FA code'
            ? 'Невірний код 2FA'
            : json.error === 'Invalid password'
              ? 'Невірний пароль'
              : json.error || 'Не вдалося вимкнути 2FA',
          'error',
        );
        return;
      }
      showToast('2FA вимкнено', 'success');
      resetForm();
      await load();
    } catch {
      showToast('Мережева помилка', 'error');
    } finally {
      setBusy(false);
    }
  }

  async function copySecret() {
    if (!draft?.secret) return;
    try {
      await navigator.clipboard.writeText(draft.secret);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      showToast('Не вдалося скопіювати', 'error');
    }
  }

  if (loadError && !status) {
    return (
      <div className='admin-card'>
        <h2 className='admin-h2'>Безпека · 2FA</h2>
        <p className='admin-hint admin-login-error'>{loadError}</p>
      </div>
    );
  }

  if (!status) {
    return (
      <div className='admin-card'>
        <h2 className='admin-h2'>Безпека · 2FA</h2>
        <p className='admin-hint'>Завантаження…</p>
      </div>
    );
  }

  return (
    <div className='admin-card admin-totp-panel'>
      <h2 className='admin-h2'>Безпека · 2FA (TOTP)</h2>
      <p className='admin-hint admin-mb'>
        Другий фактор для входу в адмінку. Google Authenticator, Aegis, 1Password тощо. Secret
        зберігається в <code>data/admin-totp.json</code> (не в <code>site.json</code>).
      </p>

      <ul className='admin-checklist admin-mb'>
        <li className={status.enabled ? 'is-ok' : 'is-info'}>
          {status.enabled ? '✓' : '·'} Статус:{' '}
          {status.enabled
            ? status.source === 'env'
              ? 'увімкнено (через .env)'
              : 'увімкнено (з адмінки)'
            : 'вимкнено'}
        </li>
        {status.enabledAt ? (
          <li className='is-info'>
            Увімкнено: {new Date(status.enabledAt).toLocaleString('uk-UA')}
          </li>
        ) : null}
      </ul>

      {status.managedByEnv ? (
        <div className='admin-totp-env-note'>
          <p>
            2FA задано через <code>ADMIN_TOTP_SECRET</code> у <code>.env</code>. Керування з адмінки
            (QR / вимкнення) недоступне — змініть або приберіть змінну і перезапустіть сервер.
          </p>
          {status.fileConfigured ? (
            <p className='admin-hint'>
              Також є файл <code>data/admin-totp.json</code>, але для логіну зараз діє env.
            </p>
          ) : null}
        </div>
      ) : null}

      {!status.managedByEnv && phase === 'idle' && !status.enabled ? (
        <div className='admin-totp-form'>
          <label>
            Пароль адмінки (підтвердження)
            <input
              type='password'
              autoComplete='current-password'
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={busy}
            />
          </label>
          <div className='admin-row admin-row--wrap'>
            <button
              type='button'
              className='admin-btn'
              disabled={busy || !password}
              onClick={() => void beginSetup()}
            >
              {busy ? 'Генерація…' : 'Увімкнути 2FA'}
            </button>
          </div>
        </div>
      ) : null}

      {!status.managedByEnv && phase === 'setup' && draft ? (
        <div className='admin-totp-setup'>
          <p className='admin-hint admin-mb'>
            1. Відскануйте QR у застосунку Authenticator. 2. Введіть 6-значний код для підтвердження.
            Secret показується <strong>один раз</strong> — збережіть його в надійному місці.
          </p>
          <div className='admin-totp-qr-wrap'>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={draft.qrDataUrl}
              alt='QR-код для налаштування 2FA'
              width={220}
              height={220}
              className='admin-totp-qr'
            />
          </div>
          <label>
            Secret (ручне введення)
            <div className='admin-row admin-row--wrap admin-totp-secret-row'>
              <code className='admin-totp-secret'>{draft.secret}</code>
              <button type='button' className='admin-btn admin-btn--secondary' onClick={() => void copySecret()}>
                {copied ? 'Скопійовано' : 'Копіювати'}
              </button>
            </div>
          </label>
          <label>
            Пароль адмінки
            <input
              type='password'
              autoComplete='current-password'
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={busy}
            />
          </label>
          <label>
            Код з Authenticator
            <input
              type='text'
              inputMode='numeric'
              autoComplete='one-time-code'
              pattern='[0-9]*'
              maxLength={6}
              placeholder='000000'
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              disabled={busy}
            />
          </label>
          <div className='admin-row admin-row--wrap'>
            <button
              type='button'
              className='admin-btn'
              disabled={busy || code.length !== 6 || !password}
              onClick={() => void confirmSetup()}
            >
              {busy ? 'Збереження…' : 'Підтвердити і увімкнути'}
            </button>
            <button
              type='button'
              className='admin-btn admin-btn--secondary'
              disabled={busy}
              onClick={resetForm}
            >
              Скасувати
            </button>
          </div>
          <p className='admin-hint'>
            otpauth URI (для ручного додавання):{' '}
            <code className='admin-totp-uri'>{draft.otpauthUrl}</code>
          </p>
        </div>
      ) : null}

      {!status.managedByEnv && status.enabled && status.source === 'file' ? (
        <div className='admin-totp-form'>
          {phase !== 'disable' ? (
            <button
              type='button'
              className='admin-btn admin-btn--secondary'
              disabled={busy}
              onClick={() => {
                setPhase('disable');
                setPassword('');
                setCode('');
              }}
            >
              Вимкнути 2FA…
            </button>
          ) : (
            <>
              <p className='admin-hint admin-mb'>
                Для вимкнення потрібні пароль адмінки та поточний код з Authenticator.
              </p>
              <label>
                Пароль адмінки
                <input
                  type='password'
                  autoComplete='current-password'
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={busy}
                />
              </label>
              <label>
                Код 2FA
                <input
                  type='text'
                  inputMode='numeric'
                  autoComplete='one-time-code'
                  pattern='[0-9]*'
                  maxLength={6}
                  placeholder='000000'
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  disabled={busy}
                />
              </label>
              <div className='admin-row admin-row--wrap'>
                <button
                  type='button'
                  className='admin-btn admin-btn--danger'
                  disabled={busy || code.length !== 6 || !password}
                  onClick={() => void disableTotp()}
                >
                  {busy ? 'Вимкнення…' : 'Підтвердити вимкнення'}
                </button>
                <button
                  type='button'
                  className='admin-btn admin-btn--secondary'
                  disabled={busy}
                  onClick={resetForm}
                >
                  Скасувати
                </button>
              </div>
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}
