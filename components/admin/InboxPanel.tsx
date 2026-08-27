'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import type { InboxItem } from '@/lib/inbox';
// Link used for client profile
import {
  fillTemplate,
  smsLink,
  telegramShareLink,
  templatesForStatus,
  viberChatLink,
} from '@/lib/reply-templates';
import { snoozeHours, snoozeTomorrow, isOverdueCallback } from '@/lib/callback-schedule';
import { formatTelHref } from '@/lib/phone';
import {
  CLOSE_OUTCOME_LABELS,
  CLOSE_OUTCOMES,
  WORKFLOW_LABELS,
  WORKFLOW_STATUSES,
  statusBadgeClass,
  statusRequiresOutcome,
  type CloseOutcome,
  type WorkflowStatus,
} from '@/lib/workflow';
import { showToast } from './AdminToast';
import { requestNotifyPermission, useAdminCounts } from './AdminCountsContext';
import { useAdminRole } from './AdminRoleContext';

function formatWhen(iso: string): string {
  try {
    return new Date(iso).toLocaleString('uk-UA');
  } catch {
    return iso;
  }
}

type Filter = 'open' | 'all' | 'stale' | 'lead' | 'order' | 'callback' | 'dup' | 'mine' | 'unassigned';

function parseInitialFilter(raw: string): Filter {
  const allowed: Filter[] = [
    'open',
    'all',
    'stale',
    'lead',
    'order',
    'callback',
    'dup',
    'mine',
    'unassigned',
  ];
  return (allowed as string[]).includes(raw) ? (raw as Filter) : 'open';
}

export function InboxPanel({
  initialPhone = '',
  initialFilter = '',
}: {
  initialPhone?: string;
  initialFilter?: string;
}) {
  const [items, setItems] = useState<InboxItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>(() => parseInitialFilter(initialFilter));
  const [phoneQ, setPhoneQ] = useState(initialPhone);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [noteDraft, setNoteDraft] = useState('');
  const [history, setHistory] = useState<InboxItem[]>([]);
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [tgConfigured, setTgConfigured] = useState<boolean | null>(null);
  const [tgBusy, setTgBusy] = useState(false);
  const listRef = useRef<HTMLUListElement>(null);
  const { refresh: refreshCounts, openTotal, latestId, live } = useAdminCounts();
  const { username } = useAdminRole();
  const [closeOutcome, setCloseOutcome] = useState<CloseOutcome | ''>('');
  const lastLatest = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch('/api/notify');
        if (!res.ok) {
          setTgConfigured(false);
          return;
        }
        const json = (await res.json()) as { configured?: boolean };
        setTgConfigured(Boolean(json.configured));
      } catch {
        setTgConfigured(false);
      }
    })();
  }, []);

  const load = useCallback(async (opts?: { silent?: boolean }) => {
    try {
      const res = await fetch('/api/inbox');
      if (!res.ok) {
        if (res.status === 401) showToast('Сесія закінчилась', 'error');
        else if (!opts?.silent) showToast('Не вдалося завантажити inbox', 'error');
        return;
      }
      const json = (await res.json()) as { items?: InboxItem[] };
      setItems(json.items || []);
    } catch {
      if (!opts?.silent) showToast('Мережева помилка', 'error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    void requestNotifyPermission();
    // Fallback poll; SSE drives counts — refresh list when latest open id changes
    const id = window.setInterval(() => void load({ silent: true }), 30_000);
    return () => window.clearInterval(id);
  }, [load]);

  // When SSE reports a new latest open item, reload list
  useEffect(() => {
    if (latestId === undefined) return;
    if (lastLatest.current === undefined) {
      lastLatest.current = latestId;
      return;
    }
    if (latestId !== lastLatest.current) {
      lastLatest.current = latestId;
      void load({ silent: true });
      void refreshCounts();
    }
  }, [latestId, load, refreshCounts]);

  const visible = useMemo(() => {
    const q = phoneQ.replace(/\D/g, '');
    const now = Date.now();
    return items.filter((i) => {
      if (filter === 'open' && !i.open) return false;
      if (filter === 'stale' && !i.stale) return false;
      if (filter === 'lead' && i.kind !== 'lead') return false;
      if (filter === 'order' && i.kind !== 'order') return false;
      if (filter === 'dup' && !i.duplicatePhone) return false;
      if (filter === 'mine') {
        if (!i.open) return false;
        if ((i.assignee || '') !== (username || 'admin')) return false;
      }
      if (filter === 'unassigned') {
        if (!i.open || i.assignee) return false;
      }
      if (filter === 'callback') {
        if (!i.callbackAt || !i.open) return false;
        const t = Date.parse(i.callbackAt);
        if (!Number.isFinite(t) || t < now - 2 * 60 * 60 * 1000) return false;
      }
      if (q && !i.phone.replace(/\D/g, '').includes(q)) return false;
      return true;
    });
  }, [items, filter, phoneQ, username]);

  const selected = useMemo(() => {
    if (!selectedKey) return visible[0] || null;
    return visible.find((i) => `${i.kind}:${i.id}` === selectedKey) || visible[0] || null;
  }, [visible, selectedKey]);

  useEffect(() => {
    if (!selected) {
      setNoteDraft('');
      setHistory([]);
      return;
    }
    setNoteDraft(selected.note || '');
    void (async () => {
      try {
        const res = await fetch(`/api/inbox?phone=${encodeURIComponent(selected.phone)}`);
        if (!res.ok) return;
        const json = (await res.json()) as { items?: InboxItem[] };
        setHistory(json.items || []);
      } catch {
        /* ignore */
      }
    })();
  }, [selected?.id, selected?.kind, selected?.phone]);

  // Keyboard navigation
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') {
        if (e.key !== 'Escape') return;
      }
      if (!visible.length) return;
      const idx = selected
        ? visible.findIndex((i) => i.id === selected.id && i.kind === selected.kind)
        : 0;

      if (e.key === 'j' || e.key === 'ArrowDown') {
        e.preventDefault();
        const next = visible[Math.min(visible.length - 1, idx + 1)];
        if (next) setSelectedKey(`${next.kind}:${next.id}`);
      } else if (e.key === 'k' || e.key === 'ArrowUp') {
        e.preventDefault();
        const prev = visible[Math.max(0, idx - 1)];
        if (prev) setSelectedKey(`${prev.kind}:${prev.id}`);
      } else if (e.key === 'c' && selected) {
        e.preventDefault();
        window.location.href = formatTelHref(selected.phone);
      } else if (e.key === 'd' && selected) {
        e.preventDefault();
        void patch(selected, { status: 'done' }, 'Готово');
      } else if (e.key === '/' && tag !== 'INPUT') {
        e.preventDefault();
        document.getElementById('inbox-phone-q')?.focus();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [visible, selected]);

  async function patch(
    item: InboxItem,
    body: {
      status?: WorkflowStatus;
      note?: string;
      callbackAt?: string;
      handled?: boolean;
      outcome?: CloseOutcome;
      assignee?: string;
    },
    okMsg: string,
  ) {
    if (body.status && statusRequiresOutcome(body.status)) {
      const outcome = body.outcome || (closeOutcome as CloseOutcome) || undefined;
      const note = body.note ?? noteDraft;
      if (!outcome) {
        showToast('Оберіть результат закриття (outcome)', 'error');
        return;
      }
      if (!(note || '').trim()) {
        showToast('Додайте нотатку при закритті', 'error');
        return;
      }
      body = { ...body, outcome, note };
    }
    setBusy(true);
    try {
      const res = await fetch('/api/inbox', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind: item.kind, id: item.id, ...body }),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        showToast(j.error || 'Не вдалося оновити', 'error');
        return;
      }
      showToast(okMsg, 'success');
      setCloseOutcome('');
      await load();
      await refreshCounts();
    } catch {
      showToast('Мережева помилка', 'error');
    } finally {
      setBusy(false);
    }
  }

  async function remove(item: InboxItem) {
    if (!confirm('Видалити запис?')) return;
    setBusy(true);
    try {
      const res = await fetch('/api/inbox', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind: item.kind, id: item.id }),
      });
      if (!res.ok) {
        showToast('Не вдалося видалити', 'error');
        return;
      }
      showToast('Видалено', 'success');
      setSelectedKey(null);
      await load();
      await refreshCounts();
    } catch {
      showToast('Мережева помилка', 'error');
    } finally {
      setBusy(false);
    }
  }

  const checkedList = useMemo(
    () => visible.filter((i) => checked[`${i.kind}:${i.id}`]),
    [visible, checked],
  );

  function toggleCheck(item: InboxItem) {
    const key = `${item.kind}:${item.id}`;
    setChecked((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  function selectAllVisible() {
    const next = { ...checked };
    for (const i of visible) next[`${i.kind}:${i.id}`] = true;
    setChecked(next);
  }

  function clearChecked() {
    setChecked({});
  }

  async function bulkStatus(status: WorkflowStatus) {
    if (!checkedList.length) {
      showToast('Оберіть записи (чекбокси)', 'info');
      return;
    }
    setBusy(true);
    let ok = 0;
    try {
      for (const item of checkedList) {
        const res = await fetch('/api/inbox', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ kind: item.kind, id: item.id, status }),
        });
        if (res.ok) ok++;
      }
      showToast(`Оновлено: ${ok}/${checkedList.length}`, 'success');
      clearChecked();
      await load();
      await refreshCounts();
    } catch {
      showToast('Мережева помилка bulk', 'error');
    } finally {
      setBusy(false);
    }
  }

  async function bulkTelegram() {
    if (!checkedList.length) {
      showToast('Оберіть записи (чекбокси)', 'info');
      return;
    }
    if (checkedList.length > 25) {
      showToast('Макс. 25 за раз', 'error');
      return;
    }
    if (!confirm(`Надіслати ${checkedList.length} запис(ів) у Telegram?`)) return;
    const note = window.prompt('Опційна нотатка до bulk (Enter — без нотатки)') || '';
    setTgBusy(true);
    try {
      const res = await fetch('/api/notify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: checkedList.map((i) => ({ kind: i.kind, id: i.id })),
          note: note.trim() || undefined,
        }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        error?: string;
        sent?: number;
        failed?: number;
        total?: number;
      };
      if (!res.ok) {
        showToast(json.error || 'Bulk Telegram не вдався', 'error');
        return;
      }
      showToast(`Telegram: ${json.sent ?? 0}/${json.total ?? checkedList.length} ok`, 'success');
      clearChecked();
    } catch {
      showToast('Мережева помилка Telegram bulk', 'error');
    } finally {
      setTgBusy(false);
    }
  }

  const templates = templatesForStatus(selected?.status);

  return (
    <div className='admin-inbox'>
      <div className='admin-row admin-row--between admin-mb'>
        <div className='admin-row admin-row--wrap'>
          <span
            className={`admin-live-dot${live ? ' is-live' : ''}`}
            title={live ? 'Live SSE' : 'Polling'}
          >
            {live ? '● live' : '○ poll'} · {openTotal} open
          </span>
          {(
            [
              ['open', 'Відкриті'],
              ['mine', 'Мої'],
              ['unassigned', 'Без assignee'],
              ['stale', 'Протерміновані'],
              ['callback', 'Передзвінки'],
              ['dup', 'Дублікати'],
              ['lead', 'Дзвінки'],
              ['order', 'Замовлення'],
              ['all', 'Усі'],
            ] as const
          ).map(([k, label]) => (
            <button
              key={k}
              type='button'
              className={`admin-btn admin-btn--secondary${filter === k ? ' is-active' : ''}`}
              onClick={() => setFilter(k)}
            >
              {label}
            </button>
          ))}
        </div>
        <div className='admin-row'>
          <input
            id='inbox-phone-q'
            type='search'
            className='admin-field-sm'
            placeholder='Телефон… (/)'
            value={phoneQ}
            onChange={(e) => setPhoneQ(e.target.value)}
            aria-label='Пошук телефону'
          />
          {/* API download, not a Next page */}
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
          <a className='admin-btn admin-btn--secondary' href='/api/inbox?format=csv'>
            CSV
          </a>
          <button type='button' className='admin-btn admin-btn--secondary' onClick={() => void load()}>
            Оновити
          </button>
        </div>
      </div>

      {checkedList.length > 0 ? (
        <div className='admin-bulk-bar admin-mb'>
          <span className='admin-hint' style={{ margin: 0 }}>
            Обрано: {checkedList.length}
          </span>
          <button type='button' className='admin-btn admin-btn--secondary admin-btn--sm' onClick={selectAllVisible}>
            Усі у фільтрі
          </button>
          <button type='button' className='admin-btn admin-btn--secondary admin-btn--sm' onClick={clearChecked}>
            Зняти
          </button>
          <button
            type='button'
            className='admin-btn admin-btn--sm'
            disabled={busy}
            onClick={() => void bulkStatus('done')}
          >
            Готово
          </button>
          <button
            type='button'
            className='admin-btn admin-btn--secondary admin-btn--sm'
            disabled={busy}
            onClick={() => void bulkStatus('spam')}
          >
            Спам
          </button>
          <button
            type='button'
            className='admin-btn admin-btn--secondary admin-btn--sm'
            disabled={busy}
            onClick={() => void bulkStatus('called')}
          >
            Дзвонили
          </button>
          {tgConfigured ? (
            <button
              type='button'
              className='admin-btn admin-btn--secondary admin-btn--sm'
              disabled={busy || tgBusy}
              onClick={() => void bulkTelegram()}
            >
              Telegram bulk
            </button>
          ) : null}
        </div>
      ) : null}

      <p className='admin-hint admin-mb'>
        Клавіші: <kbd>j</kbd>/<kbd>k</kbd> список · <kbd>c</kbd> дзвінок · <kbd>d</kbd> готово ·{' '}
        <kbd>/</kbd> пошук · <kbd>?</kbd> довідка
      </p>

      {loading ? <p className='admin-hint'>Завантаження…</p> : null}

      <div className='admin-inbox-layout'>
        <ul className='admin-inbox-list' ref={listRef}>
          {!loading && visible.length === 0 ? (
            <li className='admin-hint' style={{ padding: 16 }}>
              Черга порожня.{' '}
              <Link href='/admin/leads'>Журнал заявок</Link>
            </li>
          ) : null}
          {visible.map((item) => {
            const key = `${item.kind}:${item.id}`;
            const isSel = selected && selected.id === item.id && selected.kind === item.kind;
            return (
              <li key={key} className='admin-inbox-li'>
                <label className='admin-inbox-check'>
                  <input
                    type='checkbox'
                    checked={Boolean(checked[key])}
                    onChange={() => toggleCheck(item)}
                    aria-label={`Вибрати ${item.phone}`}
                  />
                </label>
                <button
                  type='button'
                  className={`admin-inbox-row${isSel ? ' is-selected' : ''}${item.stale ? ' is-stale' : ''}`}
                  onClick={() => setSelectedKey(key)}
                >
                  <span className='admin-inbox-row__top'>
                    <span className='admin-inbox-kind'>
                      {item.kind === 'lead' ? 'Дзвінок' : 'Замовлення'}
                    </span>
                    <span className={statusBadgeClass(item.status)}>
                      {WORKFLOW_LABELS[item.status]}
                    </span>
                    {item.stale ? <span className='admin-wf-badge admin-wf-badge--stale'>SLA</span> : null}
                    {item.assignee ? (
                      <span className='admin-wf-badge admin-wf-badge--called' title='Assignee'>
                        {item.assignee}
                      </span>
                    ) : item.open ? (
                      <span className='admin-wf-badge admin-wf-badge--stale'>free</span>
                    ) : null}
                  </span>
                  <strong className='admin-inbox-phone'>
                    {item.phone}
                    {item.duplicatePhone ? (
                      <span className='admin-wf-badge admin-wf-badge--waiting' title='Цей номер уже є в журналі'>
                        {' '}
                        дубль
                      </span>
                    ) : null}
                  </strong>
                  <span className='admin-lead-meta'>{formatWhen(item.createdAt)}</span>
                  {item.callbackAt ? (
                    <span className='admin-lead-meta'>📞 {formatWhen(item.callbackAt)}</span>
                  ) : null}
                  {item.productTitle ? (
                    <span className='admin-lead-meta'>{item.productTitle}</span>
                  ) : null}
                  {item.pagePath ? <span className='admin-lead-meta'>{item.pagePath}</span> : null}
                </button>
              </li>
            );
          })}
        </ul>

        <div className='admin-inbox-detail admin-card'>
          {!selected ? (
            <p className='admin-hint'>Оберіть запис зі списку</p>
          ) : (
            <>
              <div className='admin-row admin-row--between admin-mb'>
                <h2 className='admin-h2' style={{ margin: 0 }}>
                  {selected.kind === 'lead' ? 'Заявка' : 'Замовлення'}
                </h2>
                <span className={statusBadgeClass(selected.status)}>
                  {WORKFLOW_LABELS[selected.status]}
                </span>
              </div>
              <p>
                <a className='admin-lead-phone' href={formatTelHref(selected.phone)}>
                  {selected.phone}
                </a>
              </p>
              <p className='admin-lead-meta'>{formatWhen(selected.createdAt)}</p>
              {selected.productTitle ? (
                <p>
                  <strong>{selected.productTitle}</strong>
                  {selected.productPrice != null
                    ? ` · ${selected.productPrice.toLocaleString('uk-UA')} ₴`
                    : ''}
                  {selected.productId ? (
                    <>
                      {' · '}
                      <Link href={`/shop/${selected.productId}`} target='_blank'>
                        товар ↗
                      </Link>
                      {' · '}
                      <Link href={`/admin/goods?edit=${selected.productId}`}>редагувати</Link>
                    </>
                  ) : null}
                </p>
              ) : null}
              {selected.comment ? <p className='admin-lead-meta'>Коментар: {selected.comment}</p> : null}
              {selected.pagePath ? <p className='admin-lead-meta'>Сторінка: {selected.pagePath}</p> : null}
              {(selected.utmSource || selected.utmMedium || selected.utmCampaign) && (
                <p className='admin-lead-meta'>
                  UTM: {[selected.utmSource, selected.utmMedium, selected.utmCampaign]
                    .filter(Boolean)
                    .join(' / ')}
                </p>
              )}
              {selected.callbackAt ? (
                <p className='admin-lead-meta'>Передзвінок: {formatWhen(selected.callbackAt)}</p>
              ) : null}
              {selected.duplicatePhone ? (
                <p className='admin-hint'>
                  ⚠ Номер уже є в журналі — див. історію нижче або фільтр «Дублікати».
                </p>
              ) : null}

              <div className='admin-row admin-row--wrap admin-mb'>
                <button
                  type='button'
                  className='admin-btn'
                  disabled={busy}
                  onClick={() =>
                    void patch(
                      selected,
                      { status: 'in_progress', assignee: username || 'admin' },
                      'Взято в роботу',
                    )
                  }
                >
                  Взяв у роботу
                </button>
                {selected.assignee ? (
                  <span className='admin-hint'>Відповідальний: {selected.assignee}</span>
                ) : (
                  <span className='admin-wf-badge admin-wf-badge--stale'>без assignee</span>
                )}
              </div>

              <label className='admin-field admin-mb'>
                Статус
                <select
                  className='admin-select'
                  value={selected.status}
                  disabled={busy}
                  onChange={(e) => {
                    const st = e.target.value as WorkflowStatus;
                    if (statusRequiresOutcome(st)) {
                      showToast('Оберіть outcome + нотатку, потім кнопку закриття', 'info');
                      return;
                    }
                    void patch(selected, { status: st }, 'Статус оновлено');
                  }}
                >
                  {WORKFLOW_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {WORKFLOW_LABELS[s]}
                    </option>
                  ))}
                </select>
              </label>

              <label className='admin-field admin-mb'>
                Результат закриття (outcome)
                <select
                  className='admin-select'
                  value={closeOutcome || selected.outcome || ''}
                  disabled={busy}
                  onChange={(e) => setCloseOutcome(e.target.value as CloseOutcome | '')}
                >
                  <option value=''>— оберіть —</option>
                  {CLOSE_OUTCOMES.map((o) => (
                    <option key={o} value={o}>
                      {CLOSE_OUTCOME_LABELS[o]}
                    </option>
                  ))}
                </select>
              </label>

              <div className='admin-row admin-row--wrap admin-mb'>
                {(
                  [
                    ['called', 'Дзвонили'],
                    ['no_answer', 'Не взяв'],
                    ['waiting', 'Очікує'],
                    ['done', 'Готово'],
                    ['spam', 'Спам'],
                  ] as const
                ).map(([st, label]) => (
                  <button
                    key={st}
                    type='button'
                    className='admin-btn admin-btn--secondary'
                    disabled={busy}
                    onClick={() =>
                      void patch(
                        selected,
                        {
                          status: st,
                          ...(statusRequiresOutcome(st) && closeOutcome
                            ? { outcome: closeOutcome as CloseOutcome, note: noteDraft }
                            : {}),
                        },
                        label,
                      )
                    }
                  >
                    {label}
                  </button>
                ))}
              </div>

              <label className='admin-field admin-mb'>
                Передзвонити о
                <input
                  type='datetime-local'
                  className='admin-grow'
                  disabled={busy}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (!v) return;
                    const iso = new Date(v).toISOString();
                    void patch(selected, { status: 'waiting', callbackAt: iso }, 'Передзвінок заплановано');
                  }}
                />
              </label>

              <label className='admin-field admin-mb'>
                Нотатка
                <textarea
                  className='admin-grow'
                  rows={3}
                  value={noteDraft}
                  disabled={busy}
                  onChange={(e) => setNoteDraft(e.target.value)}
                  onBlur={() => {
                    if ((selected.note || '') === noteDraft) return;
                    void patch(selected, { note: noteDraft }, 'Нотатку збережено');
                  }}
                />
              </label>

              <div className='admin-mb'>
                <h3 className='admin-h3'>Snooze передзвону</h3>
                <div className='admin-row admin-row--wrap'>
                  <button
                    type='button'
                    className='admin-btn admin-btn--secondary'
                    disabled={busy}
                    onClick={() =>
                      void patch(
                        selected,
                        { status: 'waiting', callbackAt: snoozeHours(1) },
                        '+1 год',
                      )
                    }
                  >
                    +1 год
                  </button>
                  <button
                    type='button'
                    className='admin-btn admin-btn--secondary'
                    disabled={busy}
                    onClick={() =>
                      void patch(
                        selected,
                        { status: 'waiting', callbackAt: snoozeTomorrow(10, 0) },
                        'Завтра 10:00',
                      )
                    }
                  >
                    Завтра 10:00
                  </button>
                  {selected.callbackAt && isOverdueCallback(selected.callbackAt) ? (
                    <span className='admin-wf-badge admin-wf-badge--stale'>Прострочено</span>
                  ) : null}
                </div>
              </div>

              <div className='admin-mb'>
                <h3 className='admin-h3'>Шаблони відповідей</h3>
                <div className='admin-row admin-row--wrap'>
                  {templates.map((t) => {
                    const text = fillTemplate(t.body, {
                      phone: selected.phone,
                      product: selected.productTitle,
                    });
                    return (
                      <div key={t.id} className='admin-row' style={{ gap: 4 }}>
                        <button
                          type='button'
                          className='admin-btn admin-btn--secondary admin-btn--sm'
                          onClick={async () => {
                            try {
                              await navigator.clipboard.writeText(text);
                              showToast(`Скопійовано: ${t.label}`, 'success');
                            } catch {
                              showToast(text, 'info');
                            }
                          }}
                          title={text}
                        >
                          {t.label}
                        </button>
                        <a
                          className='admin-btn admin-btn--secondary admin-btn--sm'
                          href={viberChatLink(selected.phone)}
                          title='Viber'
                        >
                          Vb
                        </a>
                        <a
                          className='admin-btn admin-btn--secondary admin-btn--sm'
                          href={telegramShareLink(text)}
                          target='_blank'
                          rel='noreferrer'
                          title='Telegram share'
                        >
                          Tg
                        </a>
                        <a
                          className='admin-btn admin-btn--secondary admin-btn--sm'
                          href={smsLink(selected.phone, text)}
                          title='SMS'
                        >
                          SMS
                        </a>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className='admin-row admin-mb admin-row--wrap'>
                <a className='admin-btn' href={formatTelHref(selected.phone)}>
                  Подзвонити
                </a>
                <Link
                  className='admin-btn admin-btn--secondary'
                  href={`/admin/clients?phone=${encodeURIComponent(selected.phone)}`}
                >
                  Картка клієнта
                </Link>
                {tgConfigured ? (
                  <button
                    type='button'
                    className='admin-btn admin-btn--secondary'
                    disabled={busy || tgBusy}
                    onClick={async () => {
                      setTgBusy(true);
                      try {
                        const note =
                          window.prompt('Опційна нотатка в Telegram (Enter — без)') || '';
                        const res = await fetch('/api/notify', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({
                            kind: selected.kind,
                            id: selected.id,
                            note: note.trim() || undefined,
                          }),
                        });
                        if (!res.ok) {
                          const j = (await res.json().catch(() => ({}))) as { error?: string };
                          showToast(j.error || 'Telegram не надіслано', 'error');
                          return;
                        }
                        showToast('Надіслано в Telegram', 'success');
                      } catch {
                        showToast('Мережева помилка Telegram', 'error');
                      } finally {
                        setTgBusy(false);
                      }
                    }}
                  >
                    {tgBusy ? 'Telegram…' : 'Telegram ↗'}
                  </button>
                ) : tgConfigured === false ? (
                  <span className='admin-hint' title='TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID'>
                    TG off
                  </span>
                ) : null}
                <button
                  type='button'
                  className='admin-btn admin-btn--danger'
                  disabled={busy}
                  onClick={() => void remove(selected)}
                >
                  Видалити
                </button>
              </div>

              {history.length > 1 ? (
                <div>
                  <h3 className='admin-h3'>Історія за номером ({history.length})</h3>
                  <ul className='admin-leads-list'>
                    {history.map((h) => (
                      <li key={`${h.kind}:${h.id}`} className='admin-lead-item'>
                        <span className='admin-lead-meta'>
                          {h.kind === 'lead' ? 'Дзвінок' : 'Замовлення'} · {formatWhen(h.createdAt)} ·{' '}
                          {WORKFLOW_LABELS[h.status]}
                          {h.productTitle ? ` · ${h.productTitle}` : ''}
                          {h.pagePath ? ` · ${h.pagePath}` : ''}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
