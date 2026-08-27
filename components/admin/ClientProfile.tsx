'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import type { InboxItem } from '@/lib/inbox';
import { formatTelHref } from '@/lib/phone';
import { WORKFLOW_LABELS, statusBadgeClass } from '@/lib/workflow';
import { showToast } from './AdminToast';

function formatWhen(iso: string): string {
  try {
    return new Date(iso).toLocaleString('uk-UA');
  } catch {
    return iso;
  }
}

export function ClientProfile({ initialPhone = '' }: { initialPhone?: string }) {
  const [phone, setPhone] = useState(initialPhone);
  const [q, setQ] = useState(initialPhone);
  const [items, setItems] = useState<InboxItem[]>([]);
  const [stats, setStats] = useState<{
    total: number;
    open: number;
    leads: number;
    orders: number;
    firstAt: string | null;
    lastAt: string | null;
  } | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async (p: string) => {
    const digits = p.replace(/\D/g, '');
    if (digits.length < 6) {
      showToast('Введіть телефон (мін. 6 цифр)', 'error');
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`/api/clients?phone=${encodeURIComponent(p)}`);
      if (!res.ok) {
        showToast('Не вдалося завантажити', 'error');
        return;
      }
      const json = (await res.json()) as {
        items?: InboxItem[];
        stats?: typeof stats;
        phone?: string;
      };
      setItems(json.items || []);
      setStats(json.stats || null);
      setPhone(json.phone || p);
    } catch {
      showToast('Мережева помилка', 'error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (initialPhone.replace(/\D/g, '').length >= 6) void load(initialPhone);
  }, [initialPhone, load]);

  return (
    <div>
      <div className='admin-card admin-mb'>
        <div className='admin-row admin-row--wrap'>
          <input
            className='admin-grow'
            type='search'
            placeholder='+380…'
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void load(q);
            }}
            aria-label='Телефон клієнта'
          />
          <button type='button' className='admin-btn' disabled={loading} onClick={() => void load(q)}>
            {loading ? '…' : 'Знайти'}
          </button>
          <Link className='admin-btn admin-btn--secondary' href='/admin/inbox'>
            Inbox
          </Link>
        </div>
      </div>

      {stats ? (
        <div className='admin-stats admin-mb'>
          <div className='admin-stat-card'>
            <span className='admin-stat-value'>{stats.total}</span>
            <span className='admin-stat-label'>Усього</span>
          </div>
          <div className='admin-stat-card'>
            <span className='admin-stat-value'>{stats.open}</span>
            <span className='admin-stat-label'>Відкритих</span>
          </div>
          <div className='admin-stat-card'>
            <span className='admin-stat-value'>{stats.leads}</span>
            <span className='admin-stat-label'>Заявки</span>
          </div>
          <div className='admin-stat-card'>
            <span className='admin-stat-value'>{stats.orders}</span>
            <span className='admin-stat-label'>Замовлення</span>
          </div>
        </div>
      ) : null}

      {phone ? (
        <div className='admin-card admin-mb'>
          <h2 className='admin-h2'>
            <a href={formatTelHref(phone)}>{phone}</a>
          </h2>
          {stats?.firstAt ? (
            <p className='admin-hint'>
              Перший контакт: {formatWhen(stats.firstAt)}
              {stats.lastAt ? ` · останній: ${formatWhen(stats.lastAt)}` : ''}
            </p>
          ) : null}
          <div className='admin-row'>
            <Link
              className='admin-btn admin-btn--secondary'
              href={`/admin/inbox?phone=${encodeURIComponent(phone)}`}
            >
              Відкрити в Inbox
            </Link>
          </div>
        </div>
      ) : null}

      <div className='admin-card'>
        <h2 className='admin-h2'>Історія</h2>
        {!items.length && !loading ? <p className='admin-hint'>Немає записів</p> : null}
        <ul className='admin-leads-list'>
          {items.map((item) => (
            <li key={`${item.kind}:${item.id}`} className={`admin-lead-item${item.open ? '' : ' is-handled'}`}>
              <div className='admin-lead-main'>
                <span className={statusBadgeClass(item.status)}>{WORKFLOW_LABELS[item.status]}</span>
                <span className='admin-lead-meta'>
                  {item.kind === 'lead' ? 'Дзвінок' : 'Замовлення'} · {formatWhen(item.createdAt)}
                </span>
                {item.productTitle ? <span className='admin-lead-meta'>{item.productTitle}</span> : null}
                {item.pagePath ? <span className='admin-lead-meta'>{item.pagePath}</span> : null}
                {item.note ? <span className='admin-lead-meta'>Нотатка: {item.note}</span> : null}
                {(item.utmSource || item.utmCampaign) && (
                  <span className='admin-lead-meta'>
                    UTM: {[item.utmSource, item.utmMedium, item.utmCampaign].filter(Boolean).join(' / ')}
                  </span>
                )}
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
