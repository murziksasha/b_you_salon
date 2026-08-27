'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
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
import Link from 'next/link';

interface Lead {
  id: string;
  phone: string;
  createdAt: string;
  source: string;
  emailed: boolean;
  handled: boolean;
  status?: WorkflowStatus;
  note?: string;
  pagePath?: string;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  handledAt?: string;
  callbackAt?: string;
  audit?: { at: string; action: string; detail?: string }[];
}

function formatWhen(iso: string): string {
  try {
    return new Date(iso).toLocaleString('uk-UA');
  } catch {
    return iso;
  }
}

export function LeadsPanel() {
  const [leads, setLeads] = useState<Lead[]>([]);
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
      const res = await fetch('/api/leads');
      if (!res.ok) {
        if (res.status === 401) showToast('Сесія закінчилась — увійдіть знову', 'error');
        else showToast('Не вдалося завантажити заявки', 'error');
        return;
      }
      const json = (await res.json()) as { leads?: Lead[] };
      setLeads(json.leads || []);
    } catch {
      showToast('Мережева помилка', 'error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function patchLead(
    id: string,
    body: { handled?: boolean; note?: string; status?: WorkflowStatus; callbackAt?: string },
    okMsg: string,
  ) {
    setBusyId(id);
    try {
      const res = await fetch('/api/leads', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, ...body }),
      });
      if (!res.ok) {
        if (res.status === 401) showToast('Сесія закінчилась — увійдіть знову', 'error');
        else showToast('Не вдалося оновити', 'error');
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
    if (!confirm('Видалити заявку?')) return;
    setBusyId(id);
    try {
      const res = await fetch('/api/leads', {
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
    return leads.filter((l) => {
      const st = normalizeStatus(l.status, l.handled);
      if (filter === 'open' && l.handled) return false;
      if (filter === 'done' && !l.handled) return false;
      if (statusFilter !== 'all' && st !== statusFilter) return false;
      if (!matchesTimeFilter(l.createdAt, timeFilter)) return false;
      if (!matchesPhoneQuery(l.phone, phoneQ)) return false;
      return true;
    });
  }, [leads, filter, timeFilter, phoneQ, statusFilter]);

  const openCount = leads.filter((l) => !l.handled).length;

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
        csvHref='/api/leads?format=csv'
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
          <p className='admin-hint'>Немає заявок у цьому фільтрі.</p>
          <Link href='/admin/inbox' className='admin-btn admin-btn--secondary'>
            Відкрити Inbox
          </Link>
        </div>
      ) : null}

      <ul className='admin-leads-list'>
        {visible.map((lead) => {
          const noteVal = noteDraft[lead.id] ?? lead.note ?? '';
          const busy = busyId === lead.id;
          const status = normalizeStatus(lead.status, lead.handled);
          const utm = [lead.utmSource, lead.utmMedium, lead.utmCampaign].filter(Boolean).join(' / ');
          return (
            <li key={lead.id} className={`admin-lead-item${lead.handled ? ' is-handled' : ''}`}>
              <div className='admin-lead-main'>
                <div className='admin-row admin-row--wrap' style={{ gap: 8, marginBottom: 4 }}>
                  <span className={statusBadgeClass(status)}>{WORKFLOW_LABELS[status]}</span>
                </div>
                <a className='admin-lead-phone' href={formatTelHref(lead.phone)}>
                  {lead.phone}
                </a>
                <span className='admin-lead-meta'>{formatWhen(lead.createdAt)}</span>
                <span className='admin-lead-meta'>
                  {lead.emailed ? 'email ✓' : 'без email'} · {lead.source}
                  {lead.handledAt ? ` · оброблено ${formatWhen(lead.handledAt)}` : ''}
                </span>
                {lead.pagePath ? (
                  <span className='admin-lead-meta' title={lead.pagePath}>
                    {lead.pagePath}
                  </span>
                ) : null}
                {utm ? <span className='admin-lead-meta'>UTM: {utm}</span> : null}
                {lead.callbackAt ? (
                  <span className='admin-lead-meta'>Передзвінок: {formatWhen(lead.callbackAt)}</span>
                ) : null}
                {lead.audit && lead.audit.length > 0 ? (
                  <span className='admin-lead-meta' title={lead.audit.map((a) => `${a.action} ${a.at}`).join('\n')}>
                    Історія: {lead.audit.slice(-3).map((a) => a.action).join(' → ')}
                  </span>
                ) : null}
                <label className='admin-field' style={{ marginTop: 6 }}>
                  Статус
                  <select
                    className='admin-select'
                    value={status}
                    disabled={busy}
                    onChange={(e) =>
                      void patchLead(lead.id, { status: e.target.value as WorkflowStatus }, 'Статус оновлено')
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
                    onChange={(e) => setNoteDraft((d) => ({ ...d, [lead.id]: e.target.value }))}
                    onBlur={() => {
                      const next = (noteDraft[lead.id] ?? lead.note ?? '').trim();
                      const prev = (lead.note || '').trim();
                      if (next === prev) return;
                      void patchLead(lead.id, { note: next }, 'Нотатку збережено');
                    }}
                    placeholder='Коментар оператора…'
                  />
                </label>
              </div>
              <div className='admin-row admin-row--wrap'>
                <button
                  type='button'
                  className='admin-btn admin-btn--secondary'
                  disabled={busy}
                  onClick={() => void patchLead(lead.id, { status: 'no_answer' }, 'Не взяв')}
                >
                  Не взяв
                </button>
                <button
                  type='button'
                  className='admin-btn'
                  disabled={busy}
                  onClick={() => void patchLead(lead.id, { status: 'done' }, 'Готово')}
                >
                  Готово
                </button>
                <button
                  type='button'
                  className='admin-btn admin-btn--danger'
                  disabled={busy}
                  onClick={() => void remove(lead.id)}
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
