'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { showToast } from './AdminToast';

type Entry = {
  id: string;
  at: string;
  kind: string;
  message: string;
  actor?: string;
  detail?: string;
};

function formatWhen(iso: string): string {
  try {
    return new Date(iso).toLocaleString('uk-UA');
  } catch {
    return iso;
  }
}

function hrefFor(kind: string): string {
  if (kind === 'lead_status') return '/admin/inbox';
  if (kind === 'order_status') return '/admin/orders';
  if (kind === 'site_save' || kind === 'site_restore') return '/admin/pages';
  if (kind === 'media_upload' || kind === 'media_delete') return '/admin/media';
  if (kind === 'security' || kind === 'login' || kind === 'logout') return '/admin/settings';
  return '/admin';
}

export function ActivityPanel() {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);
  const [kind, setKind] = useState('all');
  const [q, setQ] = useState('');

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/activity?limit=100');
      if (!res.ok) {
        showToast('Не вдалося завантажити', 'error');
        return;
      }
      const json = (await res.json()) as { entries?: Entry[] };
      setEntries(json.entries || []);
    } catch {
      showToast('Мережева помилка', 'error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const kinds = useMemo(() => {
    const s = new Set(entries.map((e) => e.kind));
    return Array.from(s).sort();
  }, [entries]);

  const visible = useMemo(() => {
    const query = q.trim().toLowerCase();
    return entries.filter((e) => {
      if (kind !== 'all' && e.kind !== kind) return false;
      if (!query) return true;
      return `${e.message} ${e.actor || ''} ${e.kind}`.toLowerCase().includes(query);
    });
  }, [entries, kind, q]);

  return (
    <div className='admin-card'>
      <div className='admin-row admin-row--wrap admin-mb'>
        <select className='admin-select' value={kind} onChange={(e) => setKind(e.target.value)} aria-label='Тип'>
          <option value='all'>Усі типи</option>
          {kinds.map((k) => (
            <option key={k} value={k}>
              {k}
            </option>
          ))}
        </select>
        <input
          type='search'
          className='admin-field-sm admin-grow'
          placeholder='Пошук…'
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <button type='button' className='admin-btn admin-btn--secondary' onClick={() => void load()}>
          Оновити
        </button>
      </div>
      {loading ? <p className='admin-hint'>Завантаження…</p> : null}
      {!loading && !visible.length ? <p className='admin-hint'>Порожньо</p> : null}
      <ul className='admin-activity'>
        {visible.map((a) => (
          <li key={a.id}>
            <span className='admin-activity__time'>{formatWhen(a.at)}</span>
            <span>
              <code className='admin-hint'>{a.kind}</code>{' '}
              <Link href={hrefFor(a.kind)}>{a.message}</Link>
              {a.actor ? ` · ${a.actor}` : ''}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
