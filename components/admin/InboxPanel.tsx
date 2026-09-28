'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import type { InboxItem } from '@/lib/inbox';
// Link used for client profile
import {
  fillTemplate,
  REPLY_TEMPLATES,
  smsLink,
  telegramAppShareLink,
  telegramWebShareLink,
  viberChatLink,
} from '@/lib/reply-templates';
import {
  fromDatetimeLocalValue,
  isOverdueCallback,
  snoozeHours,
  snoozeTomorrow,
  toDatetimeLocalValue,
} from '@/lib/callback-schedule';
import { formatTelHref } from '@/lib/phone';
import { CONSULT_PRODUCT_ID } from '@/lib/shop-consult';
import {
  CLOSE_OUTCOME_LABELS,
  CLOSE_OUTCOMES,
  WORKFLOW_LABELS,
  WORKFLOW_STATUSES,
  defaultOutcomeForStatus,
  isCloseOutcome,
  isClosedStatus,
  resolveCloseOutcome,
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

async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
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
  /** Two-step delete — avoids window.confirm (often blocked) and blur→busy races. */
  const [deleteArmed, setDeleteArmed] = useState(false);
  const listRef = useRef<HTMLUListElement>(null);
  const noteBlurTimer = useRef<number | null>(null);
  const { refresh: refreshCounts, openTotal, latestId, live } = useAdminCounts();
  const { username } = useAdminRole();
  const [selectedTemplateId, setSelectedTemplateId] = useState(REPLY_TEMPLATES[0]?.id || 'greet');
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
    return () => {
      window.clearInterval(id);
      if (noteBlurTimer.current != null) window.clearTimeout(noteBlurTimer.current);
    };
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

  const selectedTemplate =
    REPLY_TEMPLATES.find((t) => t.id === selectedTemplateId) || REPLY_TEMPLATES[0];
  const templateText =
    selected && selectedTemplate
      ? fillTemplate(selectedTemplate.body, {
          phone: selected.phone,
          product: selected.productTitle,
        })
      : '';

  useEffect(() => {
    setDeleteArmed(false);
  }, [selected?.id, selected?.kind]);

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
  }, [selected]);

  const patch = useCallback(
    async (
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
    ) => {
      if (body.status && statusRequiresOutcome(body.status)) {
        const outcome = resolveCloseOutcome(body.status, body.outcome);
        if (!outcome) {
          showToast('Оберіть результат закриття (outcome)', 'error');
          return;
        }
        body = { ...body, outcome };
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
        await load();
        await refreshCounts();
      } catch {
        showToast('Мережева помилка', 'error');
      } finally {
        setBusy(false);
      }
    },
    [load, refreshCounts],
  );

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
        void patch(selected, { status: 'done', outcome: defaultOutcomeForStatus('done') }, 'Готово');
      } else if (e.key === '/' && tag !== 'INPUT') {
        e.preventDefault();
        document.getElementById('inbox-phone-q')?.focus();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [visible, selected, patch]);

  async function remove(item: InboxItem) {
    setBusy(true);
    setDeleteArmed(false);
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

  function flushNoteDraft(item: InboxItem, draft: string) {
    if ((item.note || '') === draft) return;
    void patch(item, { note: draft }, 'Нотатку збережено');
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
      const outcome = defaultOutcomeForStatus(status);
      for (const item of checkedList) {
        const res = await fetch('/api/inbox', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            kind: item.kind,
            id: item.id,
            status,
            ...(outcome ? { outcome } : {}),
          }),
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
                <span className='admin-row' style={{ gap: 6 }}>
                  <span className={statusBadgeClass(selected.status)}>
                    {WORKFLOW_LABELS[selected.status]}
                  </span>
                  {selected.outcome && isCloseOutcome(selected.outcome) ? (
                    <span className='admin-wf-badge'>{CLOSE_OUTCOME_LABELS[selected.outcome]}</span>
                  ) : null}
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
                  {selected.productId !== CONSULT_PRODUCT_ID && selected.productPrice != null
                    ? ` · ${selected.productPrice.toLocaleString('uk-UA')} ₴`
                    : ''}
                  {selected.productId && selected.productId !== CONSULT_PRODUCT_ID ? (
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
                    className={`admin-btn admin-btn--secondary${selected.status === st ? ' is-active' : ''}`}
                    disabled={busy}
                    onClick={() => void patch(selected, { status: st }, label)}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {isClosedStatus(selected.status) ? (
                <label className='admin-field admin-mb'>
                  Уточнити результат
                  <select
                    className='admin-select'
                    value={
                      selected.outcome && isCloseOutcome(selected.outcome) ? selected.outcome : ''
                    }
                    disabled={busy}
                    onChange={(e) => {
                      const v = e.target.value;
                      if (!isCloseOutcome(v)) return;
                      void patch(selected, { outcome: v }, 'Результат оновлено');
                    }}
                  >
                    {!selected.outcome || !isCloseOutcome(selected.outcome) ? (
                      <option value=''>— оберіть —</option>
                    ) : null}
                    {CLOSE_OUTCOMES.map((o) => (
                      <option key={o} value={o}>
                        {CLOSE_OUTCOME_LABELS[o]}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}

              <label className='admin-field admin-mb'>
                Передзвонити о
                <input
                  type='datetime-local'
                  value={toDatetimeLocalValue(selected.callbackAt)}
                  disabled={busy}
                  onChange={(e) => {
                    const iso = fromDatetimeLocalValue(e.target.value);
                    if (!iso) return;
                    void patch(selected, { status: 'waiting', callbackAt: iso }, 'Передзвінок заплановано');
                  }}
                />
              </label>
              <p className='admin-hint admin-mb'>
                Поставить статус «Очікує». Заявка з’явиться у фільтрі «Передзвінки» та на дашборді.
              </p>
              {selected.callbackAt ? (
                <div className='admin-row admin-mb'>
                  <button
                    type='button'
                    className='admin-btn admin-btn--secondary admin-btn--sm'
                    disabled={busy}
                    onClick={() => void patch(selected, { callbackAt: '' }, 'Передзвінок скинуто')}
                  >
                    Скинути передзвін
                  </button>
                </div>
              ) : null}

              <label className='admin-field admin-mb'>
                Нотатка
                <textarea
                  rows={3}
                  value={noteDraft}
                  disabled={busy}
                  placeholder='Коментар оператора…'
                  onChange={(e) => setNoteDraft(e.target.value)}
                  onBlur={() => {
                    // Defer so a click on Видалити / status buttons is not lost to busy=true mid-click.
                    if (noteBlurTimer.current != null) window.clearTimeout(noteBlurTimer.current);
                    const item = selected;
                    const draft = noteDraft;
                    noteBlurTimer.current = window.setTimeout(() => {
                      noteBlurTimer.current = null;
                      flushNoteDraft(item, draft);
                    }, 180);
                  }}
                />
              </label>

              <div className='admin-mb'>
                <h3 className='admin-h3'>Snooze передзвону</h3>
                <p className='admin-hint'>Статус «Очікує» + час передзвону в черзі оператора.</p>
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
                  {REPLY_TEMPLATES.map((t) => (
                    <button
                      key={t.id}
                      type='button'
                      className={`admin-btn admin-btn--secondary admin-btn--sm${
                        t.id === selectedTemplate?.id ? ' is-active' : ''
                      }`}
                      onClick={() => setSelectedTemplateId(t.id)}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
                {templateText ? <div className='admin-template-preview'>{templateText}</div> : null}
                <div className='admin-row admin-row--wrap'>
                  <button
                    type='button'
                    className='admin-btn admin-btn--secondary admin-btn--sm'
                    disabled={!templateText}
                    onClick={() => {
                      void (async () => {
                        const ok = await copyToClipboard(templateText);
                        showToast(
                          ok ? `Скопійовано: ${selectedTemplate?.label || ''}` : templateText,
                          ok ? 'success' : 'info',
                        );
                      })();
                    }}
                  >
                    Копіювати
                  </button>
                  <a
                    className='admin-btn admin-btn--secondary admin-btn--sm'
                    href={viberChatLink(selected.phone)}
                    title='Відкриє Viber з номером. Текст уже в буфері — вставте Ctrl+V.'
                    onClick={(e) => {
                      e.preventDefault();
                      const href = viberChatLink(selected.phone);
                      void (async () => {
                        const ok = await copyToClipboard(templateText);
                        showToast(
                          ok ? 'Текст у буфері — вставте у Viber (Ctrl+V)' : templateText,
                          ok ? 'success' : 'info',
                        );
                        window.location.href = href;
                      })();
                    }}
                  >
                    Viber
                  </a>
                  <a
                    className='admin-btn admin-btn--secondary admin-btn--sm'
                    href={telegramWebShareLink(
                      templateText,
                      typeof window !== 'undefined' ? window.location.origin : 'https://t.me',
                    )}
                    title='Відкриє Telegram з текстом шаблону (Ctrl+клік — web share)'
                    rel='noreferrer'
                    onClick={(e) => {
                      e.preventDefault();
                      void (async () => {
                        const ok = await copyToClipboard(templateText);
                        showToast(
                          ok ? 'Текст скопійовано. Оберіть чат у Telegram' : templateText,
                          ok ? 'success' : 'info',
                        );
                        window.location.href = telegramAppShareLink(templateText);
                      })();
                    }}
                  >
                    Telegram
                  </a>
                  <a
                    className='admin-btn admin-btn--secondary admin-btn--sm'
                    href={smsLink(selected.phone, templateText)}
                    title='Відкриє SMS на телефоні з текстом шаблону'
                  >
                    SMS
                  </a>
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
                    title='Пуш у адмін-бот. Клієнту не надсилається.'
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
                        showToast('Надіслано операторам у Telegram', 'success');
                      } catch {
                        showToast('Мережева помилка Telegram', 'error');
                      } finally {
                        setTgBusy(false);
                      }
                    }}
                  >
                    {tgBusy ? 'Telegram…' : 'Надіслати операторам у Telegram'}
                  </button>
                ) : tgConfigured === false ? (
                  <span className='admin-hint' title='TELEGRAM_BOT_TOKEN + підписник або TELEGRAM_CHAT_ID'>
                    TG off
                  </span>
                ) : null}
                {deleteArmed ? (
                  <>
                    <button
                      type='button'
                      className='admin-btn admin-btn--danger'
                      disabled={busy}
                      onMouseDown={(e) => {
                        e.preventDefault();
                        if (noteBlurTimer.current != null) {
                          window.clearTimeout(noteBlurTimer.current);
                          noteBlurTimer.current = null;
                        }
                        void remove(selected);
                      }}
                    >
                      Підтвердити видалення
                    </button>
                    <button
                      type='button'
                      className='admin-btn admin-btn--secondary'
                      disabled={busy}
                      onMouseDown={(e) => {
                        e.preventDefault();
                        setDeleteArmed(false);
                      }}
                    >
                      Скасувати
                    </button>
                  </>
                ) : (
                  <button
                    type='button'
                    className='admin-btn admin-btn--danger'
                    disabled={busy}
                    title='Видалити заявку з журналу'
                    onMouseDown={(e) => {
                      // mousedown runs before textarea blur → avoids dead click when note is focused
                      e.preventDefault();
                      if (noteBlurTimer.current != null) {
                        window.clearTimeout(noteBlurTimer.current);
                        noteBlurTimer.current = null;
                      }
                      setDeleteArmed(true);
                    }}
                  >
                    Видалити
                  </button>
                )}
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
