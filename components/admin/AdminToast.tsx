'use client';

import { useCallback, useEffect, useState } from 'react';

export type ToastKind = 'success' | 'error' | 'info';

export interface ToastMessage {
  id: number;
  text: string;
  kind: ToastKind;
}

type Listener = (toast: Omit<ToastMessage, 'id'>) => void;

const listeners = new Set<Listener>();
let nextId = 1;

/** Imperative toast API for admin editors. */
export function showToast(text: string, kind: ToastKind = 'info') {
  listeners.forEach((fn) => fn({ text, kind }));
}

export function AdminToastHost() {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const push = useCallback((toast: Omit<ToastMessage, 'id'>) => {
    const id = nextId++;
    setToasts((prev) => [...prev, { ...toast, id }]);
    const ttl = toast.kind === 'error' ? 6000 : 3200;
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, ttl);
  }, []);

  useEffect(() => {
    listeners.add(push);
    return () => {
      listeners.delete(push);
    };
  }, [push]);

  if (!toasts.length) return null;

  const hasError = toasts.some((t) => t.kind === 'error');

  return (
    <div
      className='admin-toast-host'
      role='status'
      aria-live={hasError ? 'assertive' : 'polite'}
    >
      {toasts.map((t) => (
        <button
          key={t.id}
          type='button'
          className={`admin-toast admin-toast--${t.kind}`}
          onClick={() => setToasts((prev) => prev.filter((x) => x.id !== t.id))}
          title='Закрити'
        >
          {t.text}
        </button>
      ))}
    </div>
  );
}
