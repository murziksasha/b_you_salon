'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import type { TimeFilter } from '@/lib/journal-filter';
import { matchesPhoneQuery, matchesTimeFilter } from '@/lib/journal-filter';
import { formatTelHref } from '@/lib/phone';
import {
  WORKFLOW_LABELS,
  WORKFLOW_STATUSES,
  normalizeStatus,
  statusBadgeClass,
  type WorkflowStatus,
} from '@/lib/workflow';
import { showToast } from './AdminToast';
import { useAdminCounts } from './AdminCountsContext';
import { JournalToolbar } from './JournalToolbar';

interface OrderProduct {
  id: string;
  title: string;
  price: number;
  code?: string;
}

interface Order {
  id: string;
  phone: string;
  createdAt: string;
  comment?: string;
  name?: string;
  quantity: number;
  product: OrderProduct;
  items?: Array<OrderProduct & { qty: number }>;
  total?: number;
  fulfillment?: 'pickup' | 'delivery';
  address?: string;
  source: string;
  emailed: boolean;
  handled: boolean;
  status?: WorkflowStatus;
  note?: string;
  handledAt?: string;
  callbackAt?: string;
  audit?: { at: string; action: string }[];
}

function formatWhen(iso: string): string {
  try {
    return new Date(iso).toLocaleString('uk-UA');
  } catch {
    return iso;
  }
}

export function OrdersPanel() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'open' | 'done'>('open');
  const [statusFilter, setStatusFilter] = useState<WorkflowStatus | 'all'>('all');
  const [timeFilter, setTimeFilter] = useState<TimeFilter>('all');
  const [phoneQ, setPhoneQ] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [noteDraft, setNoteDraft] = useState<Record<string, string>>({});
  const { refresh: refreshCounts } = useAdminCounts();

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/orders');
      if (!res.ok) {
        if (res.status === 401) showToast('Сесія закінчилась — увійдіть знову', 'error');
        else showToast('Не вдалося завантажити замовлення', 'error');
        return;
      }
      const json = (await res.json()) as { orders?: Order[] };
      setOrders(json.orders || []);
    } catch {
      showToast('Мережева помилка', 'error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function patchOrder(
    id: string,
    body: { handled?: boolean; note?: string; status?: WorkflowStatus; callbackAt?: string },
    okMsg: string,
  ) {
    setBusyId(id);
    try {
      const res = await fetch('/api/orders', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, ...body }),
      });
      if (!res.ok) {
        showToast('Не вдалося оновити', 'error');
        return;
      }
      showToast(okMsg, 'success');
      await load();
      await refreshCounts();
    } catch {
      showToast('Мережева помилка', 'error');
    } finally {
      setBusyId(null);
    }
  }

  async function remove(id: string) {
    if (!confirm('Видалити замовлення?')) return;
    setBusyId(id);
    try {
      const res = await fetch('/api/orders', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      if (!res.ok) {
        showToast('Не вдалося видалити', 'error');
        return;
      }
      showToast('Видалено', 'success');
      await load();
      await refreshCounts();
    } catch {
      showToast('Мережева помилка', 'error');
    } finally {
      setBusyId(null);
    }
  }

  const visible = useMemo(() => {
    return orders.filter((o) => {
      const st = normalizeStatus(o.status, o.handled);
      if (filter === 'open' && o.handled) return false;
      if (filter === 'done' && !o.handled) return false;
      if (statusFilter !== 'all' && st !== statusFilter) return false;
      if (!matchesTimeFilter(o.createdAt, timeFilter)) return false;
      if (!matchesPhoneQuery(o.phone, phoneQ)) return false;
      return true;
    });
  }, [orders, filter, timeFilter, phoneQ, statusFilter]);

  const openCount = orders.filter((o) => !o.handled).length;

  return (
    <div className='admin-card'>
      <JournalToolbar
        title='Журнал'
        openCount={openCount}
        filter={filter}
        onFilter={setFilter}
        timeFilter={timeFilter}
        onTimeFilter={setTimeFilter}
        phoneQ={phoneQ}
        onPhoneQ={setPhoneQ}
        csvHref='/api/orders?format=csv'
        onRefresh={() => void load()}
        extra={
          <>
            <Link className='admin-btn' href='/admin/inbox'>
              Inbox →
            </Link>
            <select
              className='admin-select'
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as WorkflowStatus | 'all')}
              aria-label='Workflow'
            >
              <option value='all'>Усі статуси</option>
              {WORKFLOW_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {WORKFLOW_LABELS[s]}
                </option>
              ))}
            </select>
          </>
        }
      />

      {loading ? <p className='admin-hint'>Завантаження…</p> : null}
      {!loading && visible.length === 0 ? (
        <div className='admin-empty'>
          <p className='admin-hint'>Немає замовлень у цьому фільтрі.</p>
          <Link href='/admin/goods' className='admin-btn admin-btn--secondary'>
            До товарів
          </Link>
        </div>
      ) : null}

      <ul className='admin-leads-list'>
        {visible.map((order) => {
          const noteVal = noteDraft[order.id] ?? order.note ?? '';
          const busy = busyId === order.id;
          const status = normalizeStatus(order.status, order.handled);
          return (
            <li key={order.id} className={`admin-lead-item${order.handled ? ' is-handled' : ''}`}>
              <div className='admin-lead-main'>
                <div className='admin-row' style={{ gap: 8, marginBottom: 4 }}>
                  <span className={statusBadgeClass(status)}>{WORKFLOW_LABELS[status]}</span>
                </div>
                <a className='admin-lead-phone' href={formatTelHref(order.phone)}>
                  {order.phone}
                </a>
                <span className='admin-lead-meta'>{formatWhen(order.createdAt)}</span>
                <span className='admin-lead-meta'>
                  <strong>
                    {(order.items && order.items.length
                      ? order.items.map((i) => `${i.title} ×${i.qty}`).join(', ')
                      : order.product.title)}
                  </strong>
                  {' · '}
                  {(order.total ?? order.product.price).toLocaleString('uk-UA')} ₴
                  {order.fulfillment === 'delivery' ? ' · доставка' : ' · самовивіз'}
                </span>
                {order.address ? <span className='admin-lead-meta'>Адреса: {order.address}</span> : null}
                {order.comment ? <span className='admin-lead-meta'>Коментар: {order.comment}</span> : null}
                <span className='admin-lead-meta'>
                  {order.emailed ? 'email ✓' : 'без email'} · {order.source}
                  {order.handledAt ? ` · оброблено ${formatWhen(order.handledAt)}` : ''}
                </span>
                {order.audit && order.audit.length > 0 ? (
                  <span className='admin-lead-meta'>
                    Історія: {order.audit.slice(-3).map((a) => a.action).join(' → ')}
                  </span>
                ) : null}
                <div className='admin-row admin-row--wrap' style={{ marginTop: 4 }}>
                  <a
                    className='admin-lead-meta'
                    href={`/shop/${order.product.id}`}
                    target='_blank'
                    rel='noopener noreferrer'
                  >
                    Сторінка ↗
                  </a>
                  <Link className='admin-lead-meta' href={`/admin/goods?edit=${order.product.id}`}>
                    Редагувати товар
                  </Link>
                </div>
                <label className='admin-field' style={{ marginTop: 6 }}>
                  Статус
                  <select
                    className='admin-select'
                    value={status}
                    disabled={busy}
                    onChange={(e) =>
                      void patchOrder(order.id, { status: e.target.value as WorkflowStatus }, 'Статус оновлено')
                    }
                  >
                    {WORKFLOW_STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {WORKFLOW_LABELS[s]}
                      </option>
                    ))}
                  </select>
                </label>
                <label className='admin-lead-meta' style={{ display: 'block', marginTop: 6 }}>
                  Нотатка
                  <input
                    className='admin-grow'
                    style={{ display: 'block', width: '100%', marginTop: 4 }}
                    value={noteVal}
                    disabled={busy}
                    onChange={(e) => setNoteDraft((d) => ({ ...d, [order.id]: e.target.value }))}
                    onBlur={() => {
                      const next = (noteDraft[order.id] ?? order.note ?? '').trim();
                      const prev = (order.note || '').trim();
                      if (next === prev) return;
                      void patchOrder(order.id, { note: next }, 'Нотатку збережено');
                    }}
                    placeholder='Коментар оператора…'
                  />
                </label>
              </div>
              <div className='admin-row admin-row--wrap'>
                <button
                  type='button'
                  className='admin-btn'
                  disabled={busy}
                  onClick={() => void patchOrder(order.id, { status: 'done' }, 'Готово')}
                >
                  Готово
                </button>
                <button
                  type='button'
                  className='admin-btn admin-btn--danger'
                  disabled={busy}
                  onClick={() => void remove(order.id)}
                >
                  Видалити
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
