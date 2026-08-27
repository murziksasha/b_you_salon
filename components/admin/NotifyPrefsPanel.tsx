'use client';

import { useEffect, useState } from 'react';
import {
  DEFAULT_NOTIFY_PREFS,
  readNotifyPrefs,
  writeNotifyPrefs,
  type NotifyPrefs,
} from '@/lib/admin-notify-prefs';
import { showToast } from './AdminToast';
import { requestNotifyPermission } from './AdminCountsContext';

export function NotifyPrefsPanel() {
  const [prefs, setPrefs] = useState<NotifyPrefs>(DEFAULT_NOTIFY_PREFS);

  useEffect(() => {
    setPrefs(readNotifyPrefs());
  }, []);

  function update(patch: Partial<NotifyPrefs>) {
    const next = { ...prefs, ...patch };
    setPrefs(next);
    writeNotifyPrefs(next);
    showToast('Налаштування сповіщень збережено', 'success');
  }

  return (
    <div className='admin-card'>
      <h2 className='admin-h2'>Сповіщення (браузер)</h2>
      <p className='admin-hint'>Зберігаються локально в цьому браузері.</p>
      <label className='admin-check'>
        <input type='checkbox' checked={prefs.mute} onChange={(e) => update({ mute: e.target.checked })} />
        Mute (вимкнути сповіщення)
      </label>
      <label className='admin-check'>
        <input
          type='checkbox'
          checked={prefs.ordersOnly}
          onChange={(e) => update({ ordersOnly: e.target.checked })}
        />
        Лише замовлення (не callback)
      </label>
      <label className='admin-check'>
        <input type='checkbox' checked={prefs.sound} onChange={(e) => update({ sound: e.target.checked })} />
        Звук
      </label>
      <label className='admin-check'>
        <input
          type='checkbox'
          checked={prefs.titleBadge}
          onChange={(e) => update({ titleBadge: e.target.checked })}
        />
        Badge у title вкладки
      </label>
      <div className='admin-row admin-row--wrap admin-mb'>
        <label className='admin-field'>
          Quiet з (год)
          <input
            type='number'
            min={0}
            max={23}
            className='admin-field-sm'
            value={prefs.quietStart}
            onChange={(e) => update({ quietStart: Number(e.target.value) || 0 })}
          />
        </label>
        <label className='admin-field'>
          Quiet до (год)
          <input
            type='number'
            min={0}
            max={23}
            className='admin-field-sm'
            value={prefs.quietEnd}
            onChange={(e) => update({ quietEnd: Number(e.target.value) || 0 })}
          />
        </label>
      </div>
      <button type='button' className='admin-btn admin-btn--secondary' onClick={() => void requestNotifyPermission()}>
        Дозвіл Notification API
      </button>
    </div>
  );
}
