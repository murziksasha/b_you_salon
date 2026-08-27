'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { formatTelHref } from '@/lib/phone';
import { WORKFLOW_LABELS, statusBadgeClass, type WorkflowStatus } from '@/lib/workflow';
import { showToast } from './AdminToast';
import { requestNotifyPermission } from './AdminCountsContext';
import { buildDayTimeline } from '@/lib/callback-schedule';

type QueueItem = {
  kind: 'lead' | 'order';
  id: string;
  phone: string;
  createdAt: string;
  status: WorkflowStatus;
  productTitle?: string;
  pagePath?: string;
  veryStale?: boolean;
  stale?: boolean;
};

type Stats = {
  openLeads: number;
  openOrders: number;
  openTotal: number;
  veryStale: number;
  queue: QueueItem[];
  callbacks?: Array<{
    kind: 'lead' | 'order';
    id: string;
    phone: string;
    callbackAt?: string;
    status: WorkflowStatus;
    productTitle?: string;
  }>;
  byDay: Array<{ date: string; leads: number; orders: number }>;
  topPages: Array<{ path: string; count: number }>;
  topUtm: Array<{ source: string; count: number }>;
  topProducts: Array<{ productId: string; title: string; count: number }>;
  goodsVisible: number;
  goodsTotal: number;
  activity: Array<{ id: string; at: string; kind: string; message: string; actor?: string }>;
  process?: {
    medianTimeToFirstTouchLabel?: string;
    avgTimeToFirstTouchLabel?: string;
    outcomeCoverage?: number | null;
    spamRate?: number | null;
    noAnswerRate?: number | null;
    unassignedOpen?: number;
    inProgress?: number;
  };
  catalog?: {
    issueCount: number;
    issues: Array<{ productId: string; title: string; issues: string[] }>;
    visibleWithoutPhoto: number;
    hidden: number;
  };
  scheduled?: Array<{
    id: string;
    title: string;
    slug: string;
    publishAt?: string;
    hasDraft?: boolean;
  }>;
};

function formatWhen(iso: string): string {
  try {
    return new Date(iso).toLocaleString('uk-UA');
  } catch {
    return iso;
  }
}

export function DashboardExtras() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/stats');
      if (!res.ok) return;
      setStats((await res.json()) as Stats);
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    void requestNotifyPermission();
    const id = window.setInterval(() => void load(), 30_000);
    return () => window.clearInterval(id);
  }, [load]);

  if (loading && !stats) {
    return <p className='admin-hint'>Завантаження аналітики…</p>;
  }
  if (!stats) return null;

  const maxDay = Math.max(1, ...stats.byDay.map((d) => d.leads + d.orders));

  async function sendDigest(kind: 'morning' | 'evening') {
    try {
      const res = await fetch('/api/digest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind, send: true }),
      });
      const j = (await res.json().catch(() => ({}))) as { error?: string; text?: string };
      if (!res.ok) {
        showToast(j.error || 'Digest не надіслано', 'error');
        if (j.text) console.info(j.text);
        return;
      }
      showToast(`Digest ${kind} → Telegram`, 'success');
    } catch {
      showToast('Мережева помилка digest', 'error');
    }
  }

  return (
    <>
      <div className='admin-card'>
        <h2 className='admin-h2'>Ранковий / вечірній ритуал</h2>
        <ol className='admin-checklist'>
          <li>
            <Link href='/admin/inbox'>1. Inbox</Link> — відкриті + прострочені
          </li>
          <li>
            <Link href='/admin/inbox?filter=callback'>2. Передзвінки</Link>
          </li>
          <li>3. Health / SMTP (нижче на сторінці)</li>
          <li>
            <Link href='/admin/activity'>4. Активність</Link>
          </li>
        </ol>
        <div className='admin-row admin-row--wrap'>
          <button type='button' className='admin-btn' onClick={() => void sendDigest('morning')}>
            ☀️ Ранковий digest → TG
          </button>
          <button
            type='button'
            className='admin-btn admin-btn--secondary'
            onClick={() => void sendDigest('evening')}
          >
            🌙 Handoff digest → TG
          </button>
          <Link className='admin-btn admin-btn--secondary' href='/admin/ops'>
            Аварійний runbook
          </Link>
        </div>
      </div>

      {stats.process ? (
        <div className='admin-card'>
          <h2 className='admin-h2'>Метрики процесу</h2>
          <ul className='admin-checklist'>
            <li>
              Медіана first-touch:{' '}
              <strong>{stats.process.medianTimeToFirstTouchLabel || '—'}</strong>
            </li>
            <li>Середній first-touch: {stats.process.avgTimeToFirstTouchLabel || '—'}</li>
            <li>
              Outcome coverage:{' '}
              {stats.process.outcomeCoverage != null
                ? `${Math.round(stats.process.outcomeCoverage * 100)}%`
                : '—'}
            </li>
            <li>
              Spam rate:{' '}
              {stats.process.spamRate != null
                ? `${Math.round(stats.process.spamRate * 100)}%`
                : '—'}
            </li>
            <li>Без assignee (open): {stats.process.unassignedOpen ?? 0}</li>
            <li>В роботі: {stats.process.inProgress ?? 0}</li>
          </ul>
        </div>
      ) : null}

      {stats.catalog && stats.catalog.issueCount > 0 ? (
        <div className='admin-card'>
          <h2 className='admin-h2'>Каталог · проблеми ({stats.catalog.issueCount})</h2>
          <ul className='admin-checklist'>
            {stats.catalog.issues.slice(0, 8).map((i) => (
              <li key={i.productId}>
                <Link href={`/admin/goods?edit=${i.productId}`}>{i.title}</Link>: {i.issues.join(', ')}
              </li>
            ))}
          </ul>
          <p className='admin-hint'>
            Без фото (visible): {stats.catalog.visibleWithoutPhoto} · hidden: {stats.catalog.hidden}
          </p>
        </div>
      ) : null}

      {stats.scheduled && stats.scheduled.length > 0 ? (
        <div className='admin-card'>
          <h2 className='admin-h2'>Календар publishAt</h2>
          <ul className='admin-checklist'>
            {stats.scheduled.map((p) => (
              <li key={p.id}>
                <Link href={`/admin/pages/${p.slug || 'home'}`}>{p.title}</Link>
                {' · '}
                {p.publishAt ? new Date(p.publishAt).toLocaleString('uk-UA') : '—'}
                {p.hasDraft ? ' · draft' : ''}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {(stats.callbacks?.length ?? 0) > 0 ? (
        <div className='admin-card'>
          <div className='admin-row admin-row--between admin-mb'>
            <h2 className='admin-h2' style={{ margin: 0 }}>
              Передзвінки · таймлайн сьогодні
            </h2>
            <Link href='/admin/inbox?filter=callback' className='admin-btn admin-btn--secondary'>
              Усі →
            </Link>
          </div>
          {(() => {
            const { slots, overdue } = buildDayTimeline(
              (stats.callbacks || []).map((c) => ({
                id: c.id,
                kind: c.kind,
                phone: c.phone,
                callbackAt: c.callbackAt,
                open: true,
                productTitle: c.productTitle,
              })),
            );
            return (
              <>
                {overdue.length > 0 ? (
                  <p className='admin-hint' style={{ color: '#9f1239' }}>
                    Прострочено: {overdue.length} —{' '}
                    <Link href='/admin/inbox?filter=callback'>Inbox</Link>
                  </p>
                ) : null}
                <div className='admin-timeline'>
                  {slots.map((s) => (
                    <div key={s.hour} className={`admin-timeline__slot${s.items.length ? ' has-items' : ''}`}>
                      <span className='admin-timeline__hour'>{s.label}</span>
                      <div className='admin-timeline__items'>
                        {s.items.map((it) => (
                          <Link
                            key={it.id}
                            className='admin-timeline__chip'
                            href={`/admin/inbox?phone=${encodeURIComponent(it.phone)}`}
                            title={it.label || it.phone}
                          >
                            {it.phone.replace(/\s/g, '')}
                          </Link>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </>
            );
          })()}
        </div>
      ) : null}

      <div className='admin-card'>
        <div className='admin-row admin-row--between admin-mb'>
          <h2 className='admin-h2' style={{ margin: 0 }}>
            Черга дня
            {stats.veryStale > 0 ? (
              <span className='admin-badge admin-badge--warn'> {stats.veryStale} &gt;24г</span>
            ) : null}
          </h2>
          <Link href='/admin/inbox' className='admin-btn'>
            Inbox ({stats.openTotal})
          </Link>
        </div>
        {stats.queue.length === 0 ? (
          <p className='admin-hint'>Немає відкритих звернень — гарна робота.</p>
        ) : (
          <ul className='admin-leads-list'>
            {stats.queue.map((item) => (
              <li key={`${item.kind}:${item.id}`} className='admin-lead-item'>
                <div className='admin-lead-main'>
                  <span className={statusBadgeClass(item.status)}>{WORKFLOW_LABELS[item.status]}</span>
                  {item.veryStale || item.stale ? (
                    <span className='admin-wf-badge admin-wf-badge--stale'>SLA</span>
                  ) : null}
                  <a className='admin-lead-phone' href={formatTelHref(item.phone)}>
                    {item.phone}
                  </a>
                  <span className='admin-lead-meta'>
                    {item.kind === 'lead' ? 'Дзвінок' : 'Замовлення'} · {formatWhen(item.createdAt)}
                  </span>
                  {item.productTitle ? <span className='admin-lead-meta'>{item.productTitle}</span> : null}
                  {item.pagePath ? <span className='admin-lead-meta'>{item.pagePath}</span> : null}
                </div>
                <Link
                  className='admin-btn admin-btn--secondary'
                  href={`/admin/inbox?phone=${encodeURIComponent(item.phone)}`}
                >
                  Відкрити
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className='admin-card'>
        <h2 className='admin-h2'>Динаміка (30 днів)</h2>
        <div className='admin-spark' aria-hidden>
          {stats.byDay.map((d) => {
            const total = d.leads + d.orders;
            const h = Math.max(2, Math.round((total / maxDay) * 48));
            return (
              <div key={d.date} className='admin-spark__bar' title={`${d.date}: ${total}`} style={{ height: h }} />
            );
          })}
        </div>
        <p className='admin-hint'>
          Сьогодні:{' '}
          {(() => {
            const last = stats.byDay[stats.byDay.length - 1];
            return last ? `${last.leads} заявок, ${last.orders} замовлень` : '—';
          })()}
        </p>
      </div>

      <div className='admin-dash-grid'>
        <div className='admin-card'>
          <h2 className='admin-h2'>Топ сторінок (ліди)</h2>
          {stats.topPages.length === 0 ? (
            <p className='admin-hint'>Ще немає даних</p>
          ) : (
            <ul className='admin-checklist'>
              {stats.topPages.map((p) => (
                <li key={p.path}>
                  <code>{p.path}</code> — {p.count}
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className='admin-card'>
          <h2 className='admin-h2'>UTM джерела</h2>
          {stats.topUtm.length === 0 ? (
            <p className='admin-hint'>Ще немає даних</p>
          ) : (
            <ul className='admin-checklist'>
              {stats.topUtm.map((u) => (
                <li key={u.source}>
                  {u.source} — {u.count}
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className='admin-card'>
          <h2 className='admin-h2'>Топ товарів (замовлення)</h2>
          {stats.topProducts.length === 0 ? (
            <p className='admin-hint'>Ще немає замовлень</p>
          ) : (
            <ul className='admin-checklist'>
              {stats.topProducts.map((p) => (
                <li key={p.productId}>
                  <Link href={`/admin/goods?edit=${p.productId}`}>{p.title}</Link> — {p.count}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className='admin-card'>
        <h2 className='admin-h2'>Активність</h2>
        {stats.activity.length === 0 ? (
          <p className='admin-hint'>Поки порожньо — зʼявиться після дій в адмінці</p>
        ) : (
          <ul className='admin-activity'>
            {stats.activity.map((a) => {
              const href =
                a.kind === 'lead_status'
                  ? '/admin/inbox'
                  : a.kind === 'order_status'
                    ? '/admin/orders'
                    : a.kind === 'site_save' || a.kind === 'site_restore'
                      ? '/admin/pages'
                      : a.kind === 'media_upload' || a.kind === 'media_delete'
                        ? '/admin/media'
                        : a.kind === 'security' || a.kind === 'login' || a.kind === 'logout'
                          ? '/admin/settings'
                          : '/admin';
              return (
                <li key={a.id}>
                  <span className='admin-activity__time'>{formatWhen(a.at)}</span>
                  <span>
                    <Link href={href}>{a.message}</Link>
                    {a.actor ? ` · ${a.actor}` : ''}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </>
  );
}

export function OnboardingChecklist({
  hasLogo,
  hasPhone,
  goodsCount,
  smtpConfigured,
  totpHint,
}: {
  hasLogo: boolean;
  hasPhone: boolean;
  goodsCount: number;
  smtpConfigured: boolean;
  totpHint: boolean;
}) {
  const items = [
    { ok: hasLogo, label: 'Логотип у налаштуваннях', href: '/admin/settings' },
    { ok: hasPhone, label: 'Телефон шапки', href: '/admin/settings' },
    { ok: goodsCount > 0, label: 'Хоча б 1 товар', href: '/admin/goods' },
    { ok: smtpConfigured, label: 'SMTP для листів', href: '/admin/settings' },
    { ok: totpHint, label: '2FA (рекомендовано)', href: '/admin/settings' },
  ];
  const done = items.filter((i) => i.ok).length;
  if (done === items.length) return null;

  return (
    <div className='admin-card'>
      <h2 className='admin-h2'>
        Онбординг {done}/{items.length}
      </h2>
      <ul className='admin-checklist'>
        {items.map((i) => (
          <li key={i.label} className={i.ok ? 'is-ok' : 'is-warn'}>
            {i.ok ? '✓' : '!'}{' '}
            {i.ok ? (
              i.label
            ) : (
              <Link href={i.href} onClick={() => showToast('Заповніть цей пункт', 'info')}>
                {i.label}
              </Link>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
