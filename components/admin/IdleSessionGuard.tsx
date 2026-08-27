'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { showToast } from './AdminToast';

/** Warn after 6h idle; offer re-login. Session cookie is 7d — this is UX hygiene. */
const IDLE_MS = 6 * 60 * 60 * 1000;
const WARN_BEFORE_MS = 5 * 60 * 1000;

export function IdleSessionGuard() {
  const lastActive = useRef(Date.now());
  const [warning, setWarning] = useState(false);
  const warned = useRef(false);

  const bump = useCallback(() => {
    lastActive.current = Date.now();
    if (warned.current) {
      warned.current = false;
      setWarning(false);
    }
  }, []);

  useEffect(() => {
    const events = ['mousemove', 'keydown', 'click', 'scroll', 'touchstart'] as const;
    for (const e of events) window.addEventListener(e, bump, { passive: true });
    const id = window.setInterval(() => {
      const idle = Date.now() - lastActive.current;
      if (idle >= IDLE_MS - WARN_BEFORE_MS && !warned.current) {
        warned.current = true;
        setWarning(true);
        showToast('Сесія скоро потребуватиме активності — рухніть мишу або збережіть роботу', 'info');
      }
    }, 60_000);
    return () => {
      for (const e of events) window.removeEventListener(e, bump);
      window.clearInterval(id);
    };
  }, [bump]);

  if (!warning) return null;

  return (
    <div className='admin-idle-banner' role='status'>
      Давно немає активності. Продовжуйте роботу або{' '}
      <button
        type='button'
        className='admin-linkish'
        style={{ color: '#fff' }}
        onClick={async () => {
          await fetch('/api/auth', { method: 'DELETE' });
          window.location.href = '/admin/login';
        }}
      >
        увійдіть знову
      </button>
      .
    </div>
  );
}
