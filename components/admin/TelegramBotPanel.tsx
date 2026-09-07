'use client';

import { useCallback, useEffect, useState } from 'react';
import { showToast } from './AdminToast';

type Pairing = {
  code: string;
  expiresAt: string;
  createdBy: string;
};

type Subscriber = {
  userId: string;
  chatId: string;
  username?: string;
  firstName?: string;
  linkedAt: string;
  linkedBy?: string;
  mute: boolean;
  bookings: boolean;
  orders: boolean;
};

type BotSettings = {
  quietStart: number;
  quietEnd: number;
  timezone: string;
};

type Status = {
  tokenConfigured: boolean;
  legacyChat: boolean;
  canSend: boolean;
  pairing: Pairing | null;
  subscribers: Subscriber[];
  settings?: BotSettings;
};

function prefsLabel(s: Subscriber): string {
  const types = [s.bookings !== false ? 'записи' : '', s.orders !== false ? 'продажі' : ''].filter(Boolean);
  return `${types.join(' + ') || 'нічого'}${s.mute ? ' · mute' : ''}`;
}

export function TelegramBotPanel() {
  const [status, setStatus] = useState<Status | null>(null);
  const [loadError, setLoadError] = useState('');
  const [busy, setBusy] = useState(false);
  const [quietStart, setQuietStart] = useState(22);
  const [quietEnd, setQuietEnd] = useState(8);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/telegram', { cache: 'no-store', credentials: 'same-origin' });
      if (!res.ok) {
        setLoadError(res.status === 401 ? 'Потрібен вхід' : 'Не вдалося завантажити Telegram');
        return;
      }
      const json = (await res.json()) as Status;
      setStatus(json);
      if (json.settings) {
        setQuietStart(json.settings.quietStart);
        setQuietEnd(json.settings.quietEnd);
      }
      setLoadError('');
    } catch {
      setLoadError('Мережева помилка');
    }
  }, []);

  useEffect(() => {
    void load();
    const id = window.setInterval(() => void load(), 15_000);
    return () => window.clearInterval(id);
  }, [load]);

  async function pair() {
    setBusy(true);
    try {
      const res = await fetch('/api/telegram', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ action: 'pair' }),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        showToast(json.error || 'Не вдалося створити код', 'error');
        return;
      }
      showToast('Код привʼязки створено (10 хв)', 'success');
      await load();
    } catch {
      showToast('Мережева помилка', 'error');
    } finally {
      setBusy(false);
    }
  }

  async function saveQuiet() {
    setBusy(true);
    try {
      const res = await fetch('/api/telegram', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ action: 'quiet', quietStart, quietEnd }),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        showToast(json.error || 'Не вдалося зберегти тихі години', 'error');
        return;
      }
      showToast('Тихі години бота збережено', 'success');
      await load();
    } catch {
      showToast('Мережева помилка', 'error');
    } finally {
      setBusy(false);
    }
  }

  async function revoke(userId: string) {
    if (!window.confirm('Відключити цього адміністратора від бота?')) return;
    setBusy(true);
    try {
      const res = await fetch('/api/telegram', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ action: 'revoke', userId }),
      });
      if (!res.ok) {
        showToast('Не вдалося відкликати', 'error');
        return;
      }
      showToast('Підписника відключено', 'success');
      await load();
    } catch {
      showToast('Мережева помилка', 'error');
    } finally {
      setBusy(false);
    }
  }

  if (loadError && !status) {
    return (
      <div className='admin-card'>
        <h2 className='admin-h2'>Telegram-бот (адміни)</h2>
        <p className='admin-hint admin-login-error'>{loadError}</p>
      </div>
    );
  }

  const pairingLive =
    status?.pairing && Date.parse(status.pairing.expiresAt) > Date.now() ? status.pairing : null;

  return (
    <div className='admin-card'>
      <h2 className='admin-h2'>Telegram-бот (адміни)</h2>
      <p className='admin-hint'>
        Черга в Telegram: пуші з маскою номера, Viber / копія, статус. Підписатися може лише той, кому ви дали
        одноразовий код з цієї сторінки. Username бота не публікуйте на сайті. З бота не закривають заявки — лише «Взяти
        в роботу».
      </p>
      {!status ? (
        <p className='admin-hint'>Завантаження…</p>
      ) : (
        <>
          <ul className='admin-checklist'>
            <li className={status.tokenConfigured ? 'is-ok' : 'is-warn'}>
              {status.tokenConfigured ? '✓' : '!'} TELEGRAM_BOT_TOKEN{' '}
              {status.tokenConfigured ? 'задано' : 'немає — бот не запуститься'}
            </li>
            <li className={status.canSend ? 'is-ok' : 'is-info'}>
              {status.canSend ? '✓' : '·'} Відправка:{' '}
              {status.canSend
                ? `${status.subscribers.length} підписник(и)${status.legacyChat ? ' + TELEGRAM_CHAT_ID' : ''}`
                : 'немає підписників і немає TELEGRAM_CHAT_ID'}
            </li>
            <li className='is-info'>
              Процес: <code>pm2 start ecosystem.config.cjs</code> (додаток <code>byou-telegram</code>, polling)
            </li>
          </ul>

          <div className='admin-row admin-row--wrap admin-mb'>
            <button type='button' className='admin-btn' disabled={busy || !status.tokenConfigured} onClick={() => void pair()}>
              {busy ? '…' : 'Код привʼязки'}
            </button>
            <button type='button' className='admin-btn admin-btn--secondary' disabled={busy} onClick={() => void load()}>
              Оновити
            </button>
          </div>

          {pairingLive ? (
            <p className='admin-hint'>
              У боті надішліть: <strong>/start {pairingLive.code}</strong>
              <br />
              Дійсний до {new Date(pairingLive.expiresAt).toLocaleString('uk-UA')} · видав {pairingLive.createdBy}
            </p>
          ) : (
            <p className='admin-hint'>Активного коду немає. Згенеруйте, потім /start КОД у боті протягом 10 хвилин.</p>
          )}

          <h3 className='admin-h3'>Тихі години бота</h3>
          <p className='admin-hint'>
            За {status.settings?.timezone || 'Europe/Kyiv'}. У цей час нові записи/продажі не пушать — вони потраплять у
            ранковий огляд о {String(quietEnd).padStart(2, '0')}:00. Ops-алерти проходять. 22 і 8 — як у браузері; однакові
            години вимикають тишу.
          </p>
          <div className='admin-row admin-row--wrap admin-mb'>
            <label className='admin-field'>
              Quiet з (год)
              <input
                type='number'
                min={0}
                max={23}
                className='admin-field-sm'
                value={quietStart}
                onChange={(e) => setQuietStart(Number(e.target.value) || 0)}
              />
            </label>
            <label className='admin-field'>
              Quiet до (год)
              <input
                type='number'
                min={0}
                max={23}
                className='admin-field-sm'
                value={quietEnd}
                onChange={(e) => setQuietEnd(Number(e.target.value) || 0)}
              />
            </label>
            <button type='button' className='admin-btn admin-btn--secondary' disabled={busy} onClick={() => void saveQuiet()}>
              Зберегти тишу
            </button>
          </div>

          <h3 className='admin-h3'>Підписники</h3>
          {status.subscribers.length === 0 ? (
            <p className='admin-hint'>Ніхто не підключений.</p>
          ) : (
            <ul className='admin-checklist'>
              {status.subscribers.map((s) => (
                <li key={s.userId}>
                  {s.firstName || s.username || s.userId}{' '}
                  {s.username ? `@${s.username}` : ''} · {prefsLabel(s)}
                  <button
                    type='button'
                    className='admin-btn admin-btn--danger admin-btn--sm'
                    disabled={busy}
                    onClick={() => void revoke(s.userId)}
                  >
                    Відключити
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
