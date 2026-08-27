'use client';

import type { PhoneEntry, Page, Section, SiteData, SocialLink } from '@/lib/types';
import { saveSiteData } from '@/lib/admin/saveSite';
import { moveByDir, reorderItems } from '@/lib/admin/reorder';
import { useSaveShortcut, useUnsavedGuard } from '@/lib/admin/useUnsavedGuard';
import { createId } from '@/lib/id';
import { SECTION_LABELS, SECTION_TYPES, newSection } from '@/lib/section-factory';
import { SECTION_TEMPLATES } from '@/lib/section-templates';
import { pageSeoHints } from '@/lib/page-seo';
import {
  applyBody,
  draftSummary,
  diffLiveVsEditor,
  hasServerDraft,
  pageBodyFrom,
  pageFromDraft,
  pagePublished,
  pageWithDraft,
  publishedPage,
  type PageDiffLine,
} from '@/lib/page-draft';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { showToast } from './AdminToast';
import { ImageField } from './ImageField';
import { StickySaveBar } from './StickySaveBar';
import { RichTextField } from './RichTextField';
import { useAdminRole } from './AdminRoleContext';

const SOCIAL_TYPES = [
  { type: 'viber', icon: '/img/icons/viber.svg' },
  { type: 'telegram', icon: '/img/icons/telegram.svg' },
  { type: 'instagram', icon: '/img/icons/instagram.svg' },
  { type: 'youtube', icon: '/img/icons/youtube.svg' },
] as const;

export function PageConstructor({ initialData, pageSlug }: { initialData: SiteData; pageSlug: string }) {
  const [data, setData] = useState(initialData);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewKey, setPreviewKey] = useState(0);
  const [previewMode, setPreviewMode] = useState<'desktop' | 'mobile'>('desktop');
  /** Single iframe vs live+draft pair */
  const [previewSplit, setPreviewSplit] = useState(false);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const [undoStack, setUndoStack] = useState<SiteData[]>([]);
  const [redoStack, setRedoStack] = useState<SiteData[]>([]);
  const [revisions, setRevisions] = useState<Array<{ id: string; at: string; label?: string }>>([]);
  const [activeSectionId, setActiveSectionId] = useState<string | null>(null);
  const [livePreviewPath, setLivePreviewPath] = useState<string | null>(null);
  const [livePreviewBusy, setLivePreviewBusy] = useState(false);
  /** Last known published snapshot (without draft body) for draft saves. */
  const liveRef = useRef<Page | null>(null);
  const [editingDraft, setEditingDraft] = useState(false);
  const { role, username } = useAdminRole();
  const canPublishLive = role === 'owner' || role === 'legacy';
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const pageIndex = useMemo(() => data.pages.findIndex((p) => p.slug === pageSlug), [data, pageSlug]);
  const page = data.pages[pageIndex];
  const publicPath = pageSlug ? `/${pageSlug}` : '/';
  const draftKey = `admin-page-draft:${pageSlug || 'home'}`;

  // Capture published baseline once page is known
  useEffect(() => {
    if (!page) return;
    if (!liveRef.current || liveRef.current.id !== page.id) {
      liveRef.current = publishedPage(page);
    }
  }, [page?.id]);

  useUnsavedGuard(dirty);

  const reloadPreview = useCallback(() => {
    setPreviewKey((k) => k + 1);
  }, []);

  /** Push current editor page to ephemeral preview (unsaved). */
  const pushLivePreview = useCallback(async () => {
    if (!page) return;
    setLivePreviewBusy(true);
    try {
      const res = await fetch('/api/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ page }),
      });
      if (!res.ok) {
        showToast('Не вдалося створити live preview', 'error');
        return;
      }
      const json = (await res.json()) as { path?: string };
      if (json.path) {
        setLivePreviewPath(json.path);
        setPreviewOpen(true);
        setPreviewKey((k) => k + 1);
        showToast('Live preview оновлено (не опубліковано)', 'info');
      }
    } catch {
      showToast('Мережева помилка preview', 'error');
    } finally {
      setLivePreviewBusy(false);
    }
  }, [page]);

  // Local draft recovery
  useEffect(() => {
    try {
      const raw = localStorage.getItem(draftKey);
      if (!raw) return;
      const parsed = JSON.parse(raw) as { data: SiteData; at: string };
      if (!parsed?.data?.pages) return;
      if (confirm(`Знайдено локальну чернетку (${new Date(parsed.at).toLocaleString('uk-UA')}). Відновити?`)) {
        setData(parsed.data);
        setDirty(true);
        showToast('Чернетку відновлено з localStorage', 'info');
      } else {
        localStorage.removeItem(draftKey);
      }
    } catch {
      /* ignore */
    }
    // only on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!dirty) return;
    try {
      localStorage.setItem(draftKey, JSON.stringify({ data, at: new Date().toISOString() }));
    } catch {
      /* ignore */
    }
  }, [data, dirty, draftKey]);

  const loadRevisions = useCallback(async () => {
    if (!page?.id) return;
    try {
      const res = await fetch(`/api/revisions?pageId=${encodeURIComponent(page.id)}`);
      if (!res.ok) return;
      const json = (await res.json()) as { revisions?: Array<{ id: string; at: string; label?: string }> };
      setRevisions(json.revisions || []);
    } catch {
      /* ignore */
    }
  }, [page?.id]);

  useEffect(() => {
    void loadRevisions();
  }, [loadRevisions]);

  const save = useCallback(
    async (opts?: {
      force?: boolean;
      asDraft?: boolean;
      discardDraft?: boolean;
      requestReview?: boolean;
    }) => {
      if (!page || pageIndex < 0) return;

      // Publish gate: role + SEO warnings + non-empty diff
      if (!opts?.asDraft && !opts?.discardDraft && !opts?.requestReview) {
        if (!canPublishLive) {
          showToast('Live publish лише для owner — надішліть «На ревʼю»', 'error');
          return;
        }
        const hints = pageSeoHints(page).filter((h) => h.level === 'warn');
        const live = liveRef.current || publishedPage(page);
        const diffs = diffLiveVsEditor(live, page);
        if (hints.length || diffs.length) {
          const msg = [
            'Перевірка перед публікацією:',
            hints.length ? `SEO: ${hints.map((h) => h.message).join('; ')}` : '',
            diffs.length ? `Diff vs live: ${diffs.length} змін` : '',
            '',
            'OK — все одно опублікувати, Скасувати — лишитись у редакторі.',
          ]
            .filter(Boolean)
            .join('\n');
          if (!window.confirm(msg)) return;
        }
      }

      setSaving(true);

      let nextPage: Page;
      if (opts?.discardDraft) {
        nextPage = publishedPage(liveRef.current || page);
        nextPage = { ...nextPage, reviewRequested: false, reviewRequestedAt: undefined };
        setEditingDraft(false);
      } else if (opts?.requestReview) {
        const live = liveRef.current || publishedPage(page);
        nextPage = pageWithDraft(live, page);
        nextPage = {
          ...nextPage,
          reviewRequested: true,
          reviewRequestedAt: new Date().toISOString(),
          reviewRequestedBy: username || 'editor',
        };
        setEditingDraft(true);
      } else if (opts?.asDraft) {
        const live = liveRef.current || publishedPage(page);
        nextPage = pageWithDraft(live, page);
        setEditingDraft(true);
      } else {
        // Publish current editor → live
        nextPage = pagePublished(page);
        nextPage = {
          ...nextPage,
          reviewRequested: false,
          reviewRequestedAt: undefined,
          reviewRequestedBy: undefined,
        };
        liveRef.current = publishedPage(nextPage);
        setEditingDraft(false);
      }

      const pages = data.pages.map((p, i) => (i === pageIndex ? nextPage : p));
      const payload = { ...data, pages };

      const result = await saveSiteData(payload, { force: opts?.force });
      setSaving(false);
      if (result.ok) {
        // After draft save, keep editor on draft content (reload from draft field)
        let editorPage = nextPage;
        if (opts?.asDraft) {
          const loaded = pageFromDraft(nextPage);
          if (loaded) editorPage = loaded;
        }
        const pagesForUi = payload.pages.map((p, i) => (i === pageIndex ? editorPage : p));
        setData({ ...payload, pages: pagesForUi, updatedAt: result.updatedAt || payload.updatedAt });
        setDirty(false);
        try {
          localStorage.removeItem(draftKey);
        } catch {
          /* ignore */
        }
        if (opts?.discardDraft) showToast('Чернетку відхилено — live без змін', 'info');
        else if (opts?.requestReview) showToast('Чернетку збережено · запит на ревʼю owner', 'success');
        else if (opts?.asDraft) showToast('Чернетку збережено (live не змінено)', 'success');
        else showToast('Опубліковано на сайт', 'success');
        reloadPreview();
        setLivePreviewPath(null);
        if (!opts?.asDraft && !opts?.discardDraft && page.id) {
          try {
            await fetch('/api/revisions', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ action: 'snapshot', pageId: page.id, label: 'publish' }),
            });
            await loadRevisions();
          } catch {
            /* ignore */
          }
        }
      } else if (result.conflict) {
        const force = confirm(
          `${result.error}\n\nOK — перезаписати сервер. Скасувати — оновити сторінку.`,
        );
        if (force) {
          void save({ force: true, asDraft: opts?.asDraft, discardDraft: opts?.discardDraft });
        } else {
          window.location.reload();
        }
      } else {
        showToast(result.error, 'error');
      }
    },
    [canPublishLive, data, draftKey, loadRevisions, page, pageIndex, reloadPreview, username],
  );

  useSaveShortcut(() => void save(), { dirty, enabled: !saving });

  // Undo / redo
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!(e.ctrlKey || e.metaKey)) return;
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (e.key.toLowerCase() === 'z' && !e.shiftKey) {
        e.preventDefault();
        setUndoStack((stack) => {
          if (!stack.length) return stack;
          const prev = stack[stack.length - 1];
          setRedoStack((r) => [...r, data]);
          setData(prev);
          setDirty(true);
          return stack.slice(0, -1);
        });
      } else if (e.key.toLowerCase() === 'y' || (e.key.toLowerCase() === 'z' && e.shiftKey)) {
        e.preventDefault();
        setRedoStack((stack) => {
          if (!stack.length) return stack;
          const next = stack[stack.length - 1];
          setUndoStack((u) => [...u, data]);
          setData(next);
          setDirty(true);
          return stack.slice(0, -1);
        });
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [data]);

  const liveBase = liveRef.current || (page ? publishedPage(page) : null);
  const diffLines: PageDiffLine[] = useMemo(() => {
    if (!page || !liveBase) return [];
    try {
      return diffLiveVsEditor(liveBase, page);
    } catch {
      return [];
    }
  }, [liveBase, page]);

  if (!page) return <p>Сторінку не знайдено</p>;

  const seoHints = pageSeoHints(page);
  const serverDraftAt = draftSummary(page);
  const hasDraft = hasServerDraft(page) || editingDraft;

  function mark(next: SiteData) {
    setUndoStack((s) => [...s.slice(-40), data]);
    setRedoStack([]);
    setData(next);
    setDirty(true);
  }

  function loadServerDraft() {
    if (!page || !hasServerDraft(page)) return;
    const loaded = pageFromDraft(page);
    if (!loaded) return;
    mark({
      ...data,
      pages: data.pages.map((p, i) => (i === pageIndex ? loaded : p)),
    });
    setEditingDraft(true);
    showToast('Завантажено серверну чернетку в редактор', 'info');
  }

  function updatePage(patch: Partial<typeof page>) {
    const pages = [...data.pages];
    pages[pageIndex] = { ...page, ...patch };
    mark({ ...data, pages });
  }

  function updateSections(sections: Section[]) {
    updatePage({ sections });
  }

  function patchSection(index: number, patch: Record<string, unknown>) {
    const sections = [...page.sections];
    sections[index] = { ...sections[index], ...patch } as Section;
    updateSections(sections);
  }

  function moveSection(index: number, dir: -1 | 1) {
    updateSections(moveByDir(page.sections, index, dir));
  }

  function reorderSections(from: number, to: number) {
    updateSections(reorderItems(page.sections, from, to));
  }

  function duplicateSection(index: number) {
    const original = page.sections[index];
    if (!original) return;
    const copy = { ...structuredClone(original), id: createId() } as Section;
    const sections = [...page.sections];
    sections.splice(index + 1, 0, copy);
    updateSections(sections);
    setCollapsed((prev) => ({ ...prev, [copy.id]: false }));
    showToast('Секцію скопійовано', 'info');
  }

  function toggleCollapsed(id: string) {
    setCollapsed((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  function setAllCollapsed(value: boolean) {
    const next: Record<string, boolean> = {};
    for (const s of page.sections) next[s.id] = value;
    setCollapsed(next);
  }

  return (
    <div className={previewOpen ? 'admin-constructor admin-constructor--split' : 'admin-constructor'}>
      <aside className='admin-constructor-outline admin-card' aria-label='Структура секцій'>
        <h3 className='admin-h3'>Секції</h3>
        <ul className='admin-outline-list'>
          {page.sections.map((s, i) => (
            <li key={s.id}>
              <button
                type='button'
                className={`admin-outline-item${activeSectionId === s.id ? ' is-active' : ''}${
                  !s.visible ? ' is-hidden' : ''
                }`}
                onClick={() => {
                  setActiveSectionId(s.id);
                  setCollapsed((prev) => ({ ...prev, [s.id]: false }));
                  document.getElementById(`section-${s.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }}
              >
                <span className='admin-outline-idx'>{i + 1}</span>
                {SECTION_LABELS[s.type] || s.type}
                {!s.visible ? ' · hidden' : ''}
              </button>
            </li>
          ))}
        </ul>
        {seoHints.length > 0 ? (
          <div className='admin-seo-hints'>
            <h3 className='admin-h3'>SEO / якість</h3>
            <ul>
              {seoHints.map((h, i) => (
                <li key={i} className={h.level === 'warn' ? 'is-warn' : 'is-info'}>
                  {h.message}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        {diffLines.length > 0 ? (
          <div className='admin-diff-panel'>
            <h3 className='admin-h3'>Diff vs live ({diffLines.length})</h3>
            <ul className='admin-diff-list'>
              {diffLines.slice(0, 24).map((line, i) => (
                <li key={`${line.field}-${i}`} className={`admin-diff-list__item is-${line.kind}`}>
                  <strong>{line.field}</strong>
                  {line.kind === 'added' ? (
                    <span className='admin-diff-next'>+ {line.next}</span>
                  ) : line.kind === 'removed' ? (
                    <span className='admin-diff-live'>− {line.live}</span>
                  ) : (
                    <>
                      <span className='admin-diff-live' title={line.live}>
                        live: {line.live}
                      </span>
                      <span className='admin-diff-next' title={line.next}>
                        → {line.next}
                      </span>
                    </>
                  )}
                  {line.kind === 'changed' &&
                  (line.field === 'Назва' || line.field === 'Meta description') ? (
                    <button
                      type='button'
                      className='admin-linkish'
                      onClick={() => {
                        const live = liveRef.current || publishedPage(page);
                        if (line.field === 'Назва') updatePage({ title: live.title });
                        if (line.field === 'Meta description') updatePage({ description: live.description });
                        showToast(`Відкочено: ${line.field}`, 'info');
                      }}
                    >
                      ← live
                    </button>
                  ) : null}
                  {line.kind === 'changed' && line.field.startsWith('Секція ') ? (
                    <button
                      type='button'
                      className='admin-linkish'
                      onClick={() => {
                        const live = liveRef.current || publishedPage(page);
                        // restore full sections order/content from live
                        updatePage({ sections: structuredClone(live.sections) });
                        showToast('Секції відновлено з live', 'info');
                      }}
                    >
                      ← усі секції live
                    </button>
                  ) : null}
                </li>
              ))}
            </ul>
            {diffLines.length > 24 ? (
              <p className='admin-hint'>…і ще {diffLines.length - 24}</p>
            ) : null}
            <button
              type='button'
              className='admin-btn admin-btn--secondary admin-btn--sm'
              onClick={() => {
                const live = liveRef.current || publishedPage(page);
                mark({
                  ...data,
                  pages: data.pages.map((p, i) =>
                    i === pageIndex ? applyBody(p, pageBodyFrom(live)) : p,
                  ),
                });
                showToast('Редактор = live (без publish)', 'info');
              }}
            >
              Скинути редактор до live
            </button>
          </div>
        ) : (
          <p className='admin-hint' style={{ marginTop: 12 }}>
            Diff: редактор = live
          </p>
        )}
        {revisions.length > 0 ? (
          <div className='admin-revisions'>
            <h3 className='admin-h3'>Історія</h3>
            <ul className='admin-checklist'>
              {revisions.slice(0, 8).map((r) => (
                <li key={r.id}>
                  <button
                    type='button'
                    className='admin-linkish'
                    onClick={async () => {
                      if (!confirm(`Відновити ревізію ${new Date(r.at).toLocaleString('uk-UA')}?`)) return;
                      const res = await fetch('/api/revisions', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ action: 'restore', pageId: page.id, revId: r.id }),
                      });
                      if (!res.ok) {
                        showToast('Не вдалося відновити', 'error');
                        return;
                      }
                      showToast('Відновлено — оновлення…', 'success');
                      window.location.reload();
                    }}
                  >
                    {new Date(r.at).toLocaleString('uk-UA')}
                    {r.label ? ` · ${r.label}` : ''}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </aside>

      <div className='admin-constructor__editor'>
      <div className='admin-card admin-constructor-toolbar'>
        <div className='admin-toolbar'>
          <button
            type='button'
            className='admin-btn'
            onClick={() => void save()}
            disabled={saving || !canPublishLive}
            title={canPublishLive ? 'Опублікувати на сайт' : 'Лише owner'}
          >
            {saving ? 'Збереження…' : 'Опублікувати live'}
          </button>
          {!canPublishLive ? (
            <span className='admin-hint'>Publish: owner only · ви — {role}</span>
          ) : null}
          {page.reviewRequested ? (
            <span className='admin-wf-badge admin-wf-badge--waiting'>
              На ревʼю{page.reviewRequestedBy ? ` · ${page.reviewRequestedBy}` : ''}
            </span>
          ) : null}
          <button
            type='button'
            className='admin-btn admin-btn--secondary'
            onClick={() => void save({ asDraft: true })}
            disabled={saving}
          >
            Зберегти чернетку
          </button>
          <button
            type='button'
            className='admin-btn admin-btn--secondary'
            onClick={() => void save({ requestReview: true })}
            disabled={saving}
            title='Для процесу editor → owner'
          >
            На ревʼю
          </button>
          {hasServerDraft(page) ? (
            <>
              <button
                type='button'
                className='admin-btn admin-btn--secondary'
                disabled={saving}
                onClick={loadServerDraft}
              >
                Відкрити чернетку
              </button>
              <button
                type='button'
                className='admin-btn admin-btn--danger'
                disabled={saving}
                onClick={() => {
                  if (!confirm('Відхилити серверну чернетку? Live лишиться як є.')) return;
                  void save({ discardDraft: true });
                }}
              >
                Відхилити чернетку
              </button>
            </>
          ) : null}
          {hasDraft ? (
            <span className='admin-wf-badge admin-wf-badge--waiting' title={serverDraftAt || ''}>
              Чернетка{serverDraftAt ? ` · ${serverDraftAt}` : ''}
            </span>
          ) : (
            <span className='admin-wf-badge admin-wf-badge--done'>Live</span>
          )}
          <button
            type='button'
            className={`admin-btn admin-btn--secondary${previewOpen ? ' is-active' : ''}`}
            onClick={() => {
              setPreviewOpen((v) => !v);
              if (!previewOpen) {
                if (dirty) void pushLivePreview();
                else reloadPreview();
              }
            }}
          >
            {previewOpen ? 'Закрити preview' : 'Preview'}
          </button>
          <button
            type='button'
            className='admin-btn admin-btn--secondary'
            disabled={livePreviewBusy}
            onClick={() => void pushLivePreview()}
            title='Попередній перегляд без публікації'
          >
            {livePreviewBusy ? 'Preview…' : 'Live draft'}
          </button>
          <a href={publicPath} target='_blank' rel='noreferrer' className='admin-btn admin-btn--secondary'>
            Нова вкладка ↗
          </a>
          <select
            className='admin-select'
            aria-label='Додати секцію'
            onChange={(e) => {
              if (!e.target.value) return;
              const created = newSection(e.target.value);
              updateSections([...page.sections, created]);
              setCollapsed((prev) => ({ ...prev, [created.id]: false }));
              e.target.value = '';
            }}
            defaultValue=''
          >
            <option value=''>+ Додати секцію</option>
            {SECTION_TYPES.map((t) => (
              <option key={t} value={t}>
                {SECTION_LABELS[t] || t}
              </option>
            ))}
          </select>
          <select
            className='admin-select'
            aria-label='Шаблон блоків'
            onChange={(e) => {
              if (!e.target.value) return;
              const tpl = SECTION_TEMPLATES.find((t) => t.id === e.target.value);
              e.target.value = '';
              if (!tpl) return;
              if (!confirm(`Додати шаблон «${tpl.label}»?`)) return;
              const created = tpl.build();
              updateSections([...page.sections, ...created]);
              showToast(`Додано шаблон: ${tpl.label}`, 'success');
            }}
            defaultValue=''
          >
            <option value=''>+ Шаблон…</option>
            {SECTION_TEMPLATES.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </select>
          <button type='button' className='admin-btn admin-btn--secondary' onClick={() => setAllCollapsed(true)}>
            Згорнути всі
          </button>
          <button type='button' className='admin-btn admin-btn--secondary' onClick={() => setAllCollapsed(false)}>
            Розгорнути всі
          </button>
          {dirty ? <span className='admin-dirty'>Є незбережені зміни · Ctrl+S · Ctrl+Z undo</span> : null}
        </div>
        <p className='admin-hint'>
          <strong>Чернетка</strong> не змінює публічний сайт. <strong>Опублікувати live</strong> виводить
          редактор на сайт і чистить draft. Live draft = preview без публікації.
        </p>
      </div>

      <div className='admin-card'>
        <div className='admin-form'>
          <label>
            Назва сторінки
            <input value={page.title} onChange={(e) => updatePage({ title: e.target.value })} />
          </label>
          <label>
            Опис (meta)
            <input value={page.description} onChange={(e) => updatePage({ description: e.target.value })} />
          </label>
          <div
            className='admin-card'
            style={
              page.contentHtml
                ? { background: '#fff8e6', border: '1px solid #f0d78c' }
                : undefined
            }
          >
            {page.contentHtml ? (
              <p className='admin-hint' style={{ marginTop: 0 }}>
                <strong>HTML-режим активний:</strong> на публічному сайті показується лише цей HTML —
                секції конструктора <strong>ігноруються</strong>. Очистіть поле, щоб увімкнути секції.
              </p>
            ) : (
              <p className='admin-hint' style={{ marginTop: 0 }}>
                Опційний HTML (політика тощо). Якщо заповнено — секції на сайті не рендеряться.
              </p>
            )}
            <label>
              contentHtml
              <textarea
                rows={page.contentHtml ? 10 : 4}
                value={page.contentHtml || ''}
                onChange={(e) => updatePage({ contentHtml: e.target.value })}
                style={{ width: '100%', fontFamily: 'monospace', fontSize: '13px' }}
                placeholder='Залиште порожнім, щоб використовувати секції'
              />
            </label>
            {page.contentHtml ? (
              <button
                type='button'
                className='admin-btn admin-btn--secondary'
                onClick={() => {
                  if (confirm('Очистити HTML і показувати секції конструктора?')) {
                    updatePage({ contentHtml: '' });
                  }
                }}
              >
                Очистити HTML → секції
              </button>
            ) : null}
          </div>
          <div className='admin-row admin-row--wrap'>
            <label className='admin-check'>
              <input
                type='checkbox'
                checked={page.visible}
                onChange={(e) => updatePage({ visible: e.target.checked })}
              />
              Видима
            </label>
            <label className='admin-field-sm'>
              Publish at (scheduled)
              <input
                type='datetime-local'
                value={
                  page.publishAt
                    ? new Date(page.publishAt).toISOString().slice(0, 16)
                    : ''
                }
                onChange={(e) => {
                  const v = e.target.value;
                  updatePage({
                    publishAt: v ? new Date(v).toISOString() : undefined,
                  });
                }}
              />
            </label>
            <label className='admin-field-sm'>
              Розмір заголовків (rem)
              <input
                type='number'
                step='0.1'
                value={page.titleSize ?? 4.6}
                onChange={(e) => updatePage({ titleSize: parseFloat(e.target.value) || undefined })}
              />
            </label>
            <label className='admin-field-sm'>
              Масштаб тексту
              <input
                type='number'
                step='0.1'
                min={0.6}
                max={1.6}
                value={page.textScale ?? 1}
                onChange={(e) => updatePage({ textScale: parseFloat(e.target.value) || undefined })}
              />
            </label>
          </div>
        </div>
      </div>

      {page.sections.length === 0 ? (
        <div className='admin-card'>
          <p className='admin-hint'>Секцій ще немає — додайте через «+ Додати секцію» вище.</p>
        </div>
      ) : null}

      {page.sections.map((section, index) => {
        const isCollapsed = Boolean(collapsed[section.id]);
        const isDragging = dragIndex === index;
        const isDropTarget = dragOverIndex === index && dragIndex !== null && dragIndex !== index;
        return (
          <div
            key={section.id}
            id={`section-${section.id}`}
            className={`admin-section-item admin-form${isCollapsed ? ' is-collapsed' : ''}${
              section.visible ? '' : ' is-hidden-section'
            }${isDragging ? ' is-dragging' : ''}${isDropTarget ? ' is-drop-target' : ''}`}
            draggable
            onDragStart={(e) => {
              const target = e.target as HTMLElement;
              // Only start drag from the handle — avoid stealing focus from inputs
              if (!target.closest('.admin-drag-handle')) {
                e.preventDefault();
                return;
              }
              setDragIndex(index);
              e.dataTransfer.effectAllowed = 'move';
              e.dataTransfer.setData('text/plain', String(index));
            }}
            onDragEnd={() => {
              setDragIndex(null);
              setDragOverIndex(null);
            }}
            onDragOver={(e) => {
              e.preventDefault();
              e.dataTransfer.dropEffect = 'move';
              if (dragOverIndex !== index) setDragOverIndex(index);
            }}
            onDragLeave={() => {
              if (dragOverIndex === index) setDragOverIndex(null);
            }}
            onDrop={(e) => {
              e.preventDefault();
              const fromRaw = e.dataTransfer.getData('text/plain');
              const from = fromRaw ? Number(fromRaw) : dragIndex;
              if (from != null && Number.isFinite(from)) {
                reorderSections(from, index);
              }
              setDragIndex(null);
              setDragOverIndex(null);
            }}
          >
            <div className='admin-row admin-row--between'>
              <div className='admin-row admin-section-head'>
                <span
                  className='admin-drag-handle'
                  title='Перетягнути секцію'
                  role='button'
                  tabIndex={0}
                  aria-label={`Перетягнути секцію ${index + 1}`}
                  onKeyDown={(e) => {
                    if (e.key === 'ArrowUp' && index > 0) {
                      e.preventDefault();
                      moveSection(index, -1);
                    }
                    if (e.key === 'ArrowDown' && index < page.sections.length - 1) {
                      e.preventDefault();
                      moveSection(index, 1);
                    }
                  }}
                >
                  ⠿
                </span>
                <button
                  type='button'
                  className='admin-section-toggle'
                  onClick={() => toggleCollapsed(section.id)}
                  aria-expanded={!isCollapsed}
                >
                  <span className='admin-section-chevron' aria-hidden>
                    {isCollapsed ? '▸' : '▾'}
                  </span>
                  <strong>
                    {index + 1}. {SECTION_LABELS[section.type] || section.type}
                  </strong>
                  {!section.visible ? <span className='admin-badge'>прихована</span> : null}
                </button>
              </div>
              <div className='admin-row'>
                <label className='admin-check'>
                  <input
                    type='checkbox'
                    checked={section.visible}
                    onChange={(e) => patchSection(index, { visible: e.target.checked })}
                  />
                  видима
                </label>
                <label className='admin-check' title='Не показувати на мобільному'>
                  <input
                    type='checkbox'
                    checked={Boolean(section.hideOnMobile)}
                    onChange={(e) => patchSection(index, { hideOnMobile: e.target.checked })}
                  />
                  hide 📱
                </label>
                <label className='admin-check' title='Не показувати на desktop'>
                  <input
                    type='checkbox'
                    checked={Boolean(section.hideOnDesktop)}
                    onChange={(e) => patchSection(index, { hideOnDesktop: e.target.checked })}
                  />
                  hide 🖥
                </label>
                <button
                  type='button'
                  className='admin-btn admin-btn--secondary'
                  title='Вгору'
                  aria-label='Перемістити вгору'
                  disabled={index === 0}
                  onClick={() => moveSection(index, -1)}
                >
                  ↑
                </button>
                <button
                  type='button'
                  className='admin-btn admin-btn--secondary'
                  title='Вниз'
                  aria-label='Перемістити вниз'
                  disabled={index === page.sections.length - 1}
                  onClick={() => moveSection(index, 1)}
                >
                  ↓
                </button>
                <button
                  type='button'
                  className='admin-btn admin-btn--secondary'
                  title='Дублювати'
                  aria-label='Дублювати секцію'
                  onClick={() => duplicateSection(index)}
                >
                  ⧉
                </button>
                <button
                  type='button'
                  className='admin-btn admin-btn--danger'
                  aria-label='Видалити секцію'
                  onClick={() => {
                    if (!confirm('Видалити секцію?')) return;
                    updateSections(page.sections.filter((_, i) => i !== index));
                  }}
                >
                  ×
                </button>
              </div>
            </div>

            {!isCollapsed ? (
              <div className='admin-section-body'>
                {section.type === 'hero' ? (
                  <>
                    <label>
                      Заголовок (HTML)
                      <textarea
                        rows={2}
                        value={section.titleHtml}
                        onChange={(e) => patchSection(index, { titleHtml: e.target.value })}
                      />
                    </label>
                    <RichTextField
                      label='Заголовок (rich text)'
                      value={section.titleHtml || ''}
                      onChange={(html) => patchSection(index, { titleHtml: html })}
                      rows={3}
                      hint='Жирний / курсив / посилання. На сайті HTML санітизується.'
                    />
                    <label>
                      Рядки «про сервіс» (кожен з нового рядка, HTML)
                      <textarea
                        rows={4}
                        value={(section.aboutLines || []).join('\n')}
                        onChange={(e) =>
                          patchSection(index, {
                            aboutLines: e.target.value.split('\n'),
                          })
                        }
                      />
                    </label>
                    <label>
                      Заголовок форми
                      <input
                        value={section.callbackTitleHtml || section.callbackTitle || ''}
                        onChange={(e) =>
                          patchSection(index, {
                            callbackTitle: e.target.value,
                            callbackTitleHtml: e.target.value,
                          })
                        }
                      />
                    </label>
                    <div className='admin-row admin-row--wrap'>
                      <label className='admin-grow'>
                        Текст кнопки
                        <input
                          value={section.callbackButtonText || ''}
                          onChange={(e) => patchSection(index, { callbackButtonText: e.target.value })}
                        />
                      </label>
                      <label className='admin-grow'>
                        Placeholder телефону
                        <input
                          value={section.callbackPlaceholder || ''}
                          onChange={(e) => patchSection(index, { callbackPlaceholder: e.target.value })}
                        />
                      </label>
                    </div>
                    <label>
                      Активний slug у навігації послуг
                      <input
                        value={section.activeServiceSlug || ''}
                        onChange={(e) => patchSection(index, { activeServiceSlug: e.target.value })}
                        placeholder='напр. phones'
                      />
                    </label>
                    <ImageField
                      value={section.image}
                      alt={section.imageAlt}
                      onChange={(url) => patchSection(index, { image: url })}
                      onAltChange={(imageAlt) => patchSection(index, { imageAlt })}
                      preset='hero'
                    />
                  </>
                ) : null}

                {section.type === 'malfunctions' ? (
                  <>
                    <label>
                      Заголовок
                      <input value={section.title} onChange={(e) => patchSection(index, { title: e.target.value })} />
                    </label>
                    <label>
                      Intro
                      <input
                        value={section.intro || ''}
                        onChange={(e) => patchSection(index, { intro: e.target.value })}
                      />
                    </label>
                    <label>
                      Пункти (через ;)
                      <textarea
                        rows={3}
                        value={section.items.join('; ')}
                        onChange={(e) =>
                          patchSection(index, {
                            items: e.target.value
                              .split(';')
                              .map((s) => s.trim())
                              .filter(Boolean),
                          })
                        }
                      />
                    </label>
                    <ImageField
                      value={section.image}
                      onChange={(url) => patchSection(index, { image: url })}
                      preset='default'
                    />
                  </>
                ) : null}

                {section.type === 'advantages' ? (
                  <>
                    <div className='admin-subhead'>Переваги</div>
                    {(section.items || []).map((item, i) => (
                      <div key={i} className='admin-nested-card'>
                        <ImageField
                          label='Іконка'
                          value={item.icon}
                          onChange={(url) => {
                            const items = [...(section.items || [])];
                            items[i] = { ...items[i], icon: url };
                            patchSection(index, { items });
                          }}
                          preset='logo'
                        />
                        <label>
                          Текст (HTML)
                          <input
                            value={item.textHtml}
                            onChange={(e) => {
                              const items = [...(section.items || [])];
                              items[i] = { ...items[i], textHtml: e.target.value };
                              patchSection(index, { items });
                            }}
                          />
                        </label>
                        <button
                          type='button'
                          className='admin-btn admin-btn--danger'
                          onClick={() => {
                            const items = (section.items || []).filter((_, ii) => ii !== i);
                            patchSection(index, { items });
                          }}
                        >
                          Видалити перевагу
                        </button>
                      </div>
                    ))}
                    <button
                      type='button'
                      className='admin-btn admin-btn--secondary'
                      onClick={() => {
                        const items = [
                          ...(section.items || []),
                          { icon: '/img/icons/descr_key.png', iconAlt: 'icon', textHtml: 'Нова перевага' },
                        ];
                        patchSection(index, { items });
                      }}
                    >
                      + перевага
                    </button>
                  </>
                ) : null}

                {section.type === 'about-links' ? (
                  <>
                    <label>
                      Заголовок (HTML)
                      <input
                        value={section.titleHtml || ''}
                        onChange={(e) => patchSection(index, { titleHtml: e.target.value })}
                      />
                    </label>
                    <label>
                      Subtitle
                      <input
                        value={section.subtitle || ''}
                        onChange={(e) => patchSection(index, { subtitle: e.target.value })}
                      />
                    </label>
                    <div className='admin-subhead'>Посилання</div>
                    {(section.items || []).map((item, i) => (
                      <div key={i} className='admin-nested-card'>
                        <label>
                          Назва
                          <input
                            value={item.label}
                            onChange={(e) => {
                              const items = [...(section.items || [])];
                              items[i] = { ...items[i], label: e.target.value };
                              patchSection(index, { items });
                            }}
                          />
                        </label>
                        <label>
                          Посилання
                          <input
                            value={item.href}
                            onChange={(e) => {
                              const items = [...(section.items || [])];
                              items[i] = { ...items[i], href: e.target.value };
                              patchSection(index, { items });
                            }}
                          />
                        </label>
                        <ImageField
                          value={item.image}
                          onChange={(url) => {
                            const items = [...(section.items || [])];
                            items[i] = { ...items[i], image: url };
                            patchSection(index, { items });
                          }}
                          preset='default'
                        />
                        <button
                          type='button'
                          className='admin-btn admin-btn--danger'
                          onClick={() => {
                            const items = (section.items || []).filter((_, ii) => ii !== i);
                            patchSection(index, { items });
                          }}
                        >
                          Видалити
                        </button>
                      </div>
                    ))}
                    <button
                      type='button'
                      className='admin-btn admin-btn--secondary'
                      onClick={() => {
                        const items = [
                          ...(section.items || []),
                          { href: '#', image: '/img/about-link/other.png', imageAlt: '', label: 'Новий' },
                        ];
                        patchSection(index, { items });
                      }}
                    >
                      + посилання
                    </button>
                  </>
                ) : null}

                {section.type === 'feedback' ? (
                  <>
                    <label>
                      Кнопка «більше»
                      <input
                        value={section.moreReviewsButtonText || ''}
                        onChange={(e) => patchSection(index, { moreReviewsButtonText: e.target.value })}
                      />
                    </label>
                    <div className='admin-subhead'>Зображення відгуків</div>
                    <p className='admin-hint'>
                      Слайдер фіксує розмір по найбільшому скріну. Краще однаковий кадр (орієнтир —
                      найвищий, напр. з відповіддю власника).
                    </p>
                    {(section.images || []).map((img, i) => (
                      <div key={i} className='admin-nested-card'>
                        <ImageField
                          value={img}
                          onChange={(url) => {
                            const imgs = [...(section.images || [])];
                            imgs[i] = url;
                            patchSection(index, { images: imgs });
                          }}
                          preset='default'
                        />
                        <button
                          type='button'
                          className='admin-btn admin-btn--danger'
                          onClick={() => {
                            const imgs = (section.images || []).filter((_, ii) => ii !== i);
                            patchSection(index, { images: imgs });
                          }}
                        >
                          Видалити
                        </button>
                      </div>
                    ))}
                    <button
                      type='button'
                      className='admin-btn admin-btn--secondary'
                      onClick={() => {
                        const imgs = [...(section.images || []), '/img/feedback/feed-1.jpg'];
                        patchSection(index, { images: imgs });
                      }}
                    >
                      + зображення
                    </button>
                  </>
                ) : null}

                {section.type === 'contacts' ? (
                  <>
                    <label>
                      Заголовок
                      <input value={section.title} onChange={(e) => patchSection(index, { title: e.target.value })} />
                    </label>
                    <label>
                      Invite text
                      <input
                        value={section.inviteText || ''}
                        onChange={(e) => patchSection(index, { inviteText: e.target.value })}
                      />
                    </label>
                    <label>
                      Address HTML
                      <textarea
                        rows={2}
                        value={section.addressHtml || ''}
                        onChange={(e) => patchSection(index, { addressHtml: e.target.value })}
                      />
                    </label>
                    <label>
                      Email
                      <input
                        value={section.email || ''}
                        onChange={(e) => patchSection(index, { email: e.target.value })}
                      />
                    </label>
                    <label>
                      Map embed URL
                      <input
                        value={section.mapEmbedUrl || ''}
                        onChange={(e) => patchSection(index, { mapEmbedUrl: e.target.value })}
                      />
                    </label>

                    <div className='admin-row admin-row--between admin-mb'>
                      <div className='admin-subhead' style={{ margin: 0 }}>
                        Телефони секції
                      </div>
                      <div className='admin-row'>
                        <button
                          type='button'
                          className='admin-btn admin-btn--secondary'
                          onClick={() => {
                            const fromSettings: PhoneEntry[] = [];
                            if (data.settings.headerPhone?.tel || data.settings.headerPhone?.display) {
                              fromSettings.push({ ...data.settings.headerPhone });
                            }
                            for (const p of data.settings.phones || []) {
                              if (!fromSettings.some((x) => x.tel === p.tel)) fromSettings.push({ ...p });
                            }
                            patchSection(index, {
                              phones: fromSettings,
                              email: section.email || data.settings.email,
                              mapEmbedUrl: section.mapEmbedUrl || data.settings.mapEmbedUrl,
                              social: section.social?.length
                                ? section.social
                                : structuredClone(data.settings.social || []),
                              addressHtml:
                                section.addressHtml ||
                                [data.settings.address, data.settings.addressNote].filter(Boolean).join('<br/>'),
                            });
                            showToast('Підтягнуто з Налаштувань', 'info');
                          }}
                        >
                          ↻ З налаштувань
                        </button>
                        <button
                          type='button'
                          className='admin-btn admin-btn--secondary'
                          onClick={() =>
                            patchSection(index, {
                              phones: [...(section.phones || []), { display: '', tel: '' }],
                            })
                          }
                        >
                          + Телефон
                        </button>
                      </div>
                    </div>
                    <p className='admin-hint admin-mb'>
                      Якщо список порожній — на сайті покажуться телефони з Налаштувань.
                    </p>
                    {(section.phones || []).map((phone, pi) => (
                      <div key={pi} className='admin-nested-card'>
                        <div className='admin-row admin-row--wrap'>
                          <label className='admin-grow'>
                            Відображення
                            <input
                              value={phone.display}
                              onChange={(e) => {
                                const phones = [...(section.phones || [])];
                                phones[pi] = { ...phones[pi], display: e.target.value };
                                patchSection(index, { phones });
                              }}
                            />
                          </label>
                          <label className='admin-grow'>
                            tel:
                            <input
                              value={phone.tel}
                              onChange={(e) => {
                                const phones = [...(section.phones || [])];
                                phones[pi] = { ...phones[pi], tel: e.target.value };
                                patchSection(index, { phones });
                              }}
                            />
                          </label>
                          <button
                            type='button'
                            className='admin-btn admin-btn--danger'
                            onClick={() =>
                              patchSection(index, {
                                phones: (section.phones || []).filter((_, ii) => ii !== pi),
                              })
                            }
                          >
                            ×
                          </button>
                        </div>
                      </div>
                    ))}

                    <div className='admin-row admin-row--between admin-mb'>
                      <div className='admin-subhead' style={{ margin: 0 }}>
                        Соцмережі секції
                      </div>
                      <button
                        type='button'
                        className='admin-btn admin-btn--secondary'
                        onClick={() => {
                          const preset = SOCIAL_TYPES[1];
                          const item: SocialLink = {
                            id: createId(),
                            type: preset.type,
                            url: '',
                            icon: preset.icon,
                          };
                          patchSection(index, { social: [...(section.social || []), item] });
                        }}
                      >
                        + Соцмережа
                      </button>
                    </div>
                    {(section.social || []).map((link, si) => (
                      <div key={link.id} className='admin-nested-card'>
                        <div className='admin-row admin-row--wrap'>
                          <label>
                            Тип
                            <select
                              className='admin-select'
                              value={link.type}
                              onChange={(e) => {
                                const type = e.target.value;
                                const preset = SOCIAL_TYPES.find((p) => p.type === type);
                                const social = [...(section.social || [])];
                                social[si] = {
                                  ...social[si],
                                  type,
                                  icon: preset?.icon || social[si].icon,
                                };
                                patchSection(index, { social });
                              }}
                            >
                              {SOCIAL_TYPES.map((p) => (
                                <option key={p.type} value={p.type}>
                                  {p.type}
                                </option>
                              ))}
                            </select>
                          </label>
                          <label className='admin-grow-2'>
                            URL
                            <input
                              value={link.url}
                              onChange={(e) => {
                                const social = [...(section.social || [])];
                                social[si] = { ...social[si], url: e.target.value };
                                patchSection(index, { social });
                              }}
                            />
                          </label>
                          <button
                            type='button'
                            className='admin-btn admin-btn--danger'
                            onClick={() =>
                              patchSection(index, {
                                social: (section.social || []).filter((_, ii) => ii !== si),
                              })
                            }
                          >
                            ×
                          </button>
                        </div>
                      </div>
                    ))}
                  </>
                ) : null}

                {section.type === 'callback' ? (
                  <>
                    <label>
                      Заголовок
                      <input
                        value={section.titleHtml || section.title || ''}
                        onChange={(e) =>
                          patchSection(index, { title: e.target.value, titleHtml: e.target.value })
                        }
                      />
                    </label>
                    <label>
                      Текст кнопки
                      <input
                        value={section.buttonText || ''}
                        onChange={(e) => patchSection(index, { buttonText: e.target.value })}
                      />
                    </label>
                    <label>
                      Placeholder телефону
                      <input
                        value={section.placeholder || ''}
                        onChange={(e) => patchSection(index, { placeholder: e.target.value })}
                      />
                    </label>
                  </>
                ) : null}

                {section.type === 'shop-grid' ? (
                  <>
                    <label>
                      Заголовок
                      <input
                        value={section.title || ''}
                        onChange={(e) => patchSection(index, { title: e.target.value })}
                      />
                    </label>
                    <label>
                      Підзаголовок
                      <input
                        value={section.subtitle || ''}
                        onChange={(e) => patchSection(index, { subtitle: e.target.value })}
                      />
                    </label>
                  </>
                ) : null}

                {section.type === 'doors-hero' ? (
                  <>
                    <p className='admin-hint'>Ліва половина — магазин, права — салон.</p>
                    <label>
                      Kicker
                      <input
                        value={section.kicker || ''}
                        onChange={(e) => patchSection(index, { kicker: e.target.value })}
                      />
                    </label>
                    <label>
                      Заголовок
                      <input
                        value={section.title || ''}
                        onChange={(e) => patchSection(index, { title: e.target.value })}
                      />
                    </label>
                    <label>
                      Підзаголовок
                      <input
                        value={section.subtitle || ''}
                        onChange={(e) => patchSection(index, { subtitle: e.target.value })}
                      />
                    </label>
                    <ImageField
                      value={section.image}
                      alt={section.imageAlt}
                      onChange={(url) => patchSection(index, { image: url })}
                      onAltChange={(imageAlt) => patchSection(index, { imageAlt })}
                      preset='hero'
                    />
                    {(['left', 'right'] as const).map((side) => (
                      <div key={side} className='admin-nested-card'>
                        <div className='admin-subhead'>{side === 'left' ? 'Ліва (магазин)' : 'Права (салон)'}</div>
                        <label>
                          Label
                          <input
                            value={section[side].label}
                            onChange={(e) =>
                              patchSection(index, { [side]: { ...section[side], label: e.target.value } })
                            }
                          />
                        </label>
                        <label>
                          Title
                          <input
                            value={section[side].title}
                            onChange={(e) =>
                              patchSection(index, { [side]: { ...section[side], title: e.target.value } })
                            }
                          />
                        </label>
                        <label>
                          Subtitle
                          <input
                            value={section[side].subtitle}
                            onChange={(e) =>
                              patchSection(index, { [side]: { ...section[side], subtitle: e.target.value } })
                            }
                          />
                        </label>
                        <label>
                          href
                          <input
                            value={section[side].href}
                            onChange={(e) =>
                              patchSection(index, { [side]: { ...section[side], href: e.target.value } })
                            }
                          />
                        </label>
                        <label>
                          CTA
                          <input
                            value={section[side].cta}
                            onChange={(e) =>
                              patchSection(index, { [side]: { ...section[side], cta: e.target.value } })
                            }
                          />
                        </label>
                      </div>
                    ))}
                  </>
                ) : null}

                {section.type === 'zone-door' ? (
                  <>
                    <label>
                      Сторона
                      <select
                        className='admin-select'
                        value={section.side}
                        onChange={(e) =>
                          patchSection(index, { side: e.target.value === 'right' ? 'right' : 'left' })
                        }
                      >
                        <option value='left'>Ліва (магазин)</option>
                        <option value='right'>Права (салон)</option>
                      </select>
                    </label>
                    <label>
                      Заголовок
                      <input value={section.title} onChange={(e) => patchSection(index, { title: e.target.value })} />
                    </label>
                    <label>
                      Підзаголовок
                      <input
                        value={section.subtitle}
                        onChange={(e) => patchSection(index, { subtitle: e.target.value })}
                      />
                    </label>
                    <label>
                      href
                      <input value={section.href} onChange={(e) => patchSection(index, { href: e.target.value })} />
                    </label>
                    <label>
                      CTA
                      <input value={section.cta} onChange={(e) => patchSection(index, { cta: e.target.value })} />
                    </label>
                    <ImageField
                      value={section.image}
                      onChange={(url) => patchSection(index, { image: url })}
                      preset='hero'
                    />
                  </>
                ) : null}

                {section.type === 'services-grid' ? (
                  <>
                    <label>
                      Заголовок
                      <input
                        value={section.title || ''}
                        onChange={(e) => patchSection(index, { title: e.target.value })}
                      />
                    </label>
                    <label>
                      Категорія (порожньо = усі)
                      <input
                        value={section.category || ''}
                        onChange={(e) => patchSection(index, { category: e.target.value })}
                      />
                    </label>
                  </>
                ) : null}

                {section.type === 'price-list' ? (
                  <>
                    <label>
                      Заголовок
                      <input
                        value={section.title || ''}
                        onChange={(e) => patchSection(index, { title: e.target.value })}
                      />
                    </label>
                    <label>
                      Джерело
                      <select
                        className='admin-select'
                        value={section.source}
                        onChange={(e) =>
                          patchSection(index, { source: e.target.value === 'manual' ? 'manual' : 'catalog' })
                        }
                      >
                        <option value='catalog'>Каталог послуг</option>
                        <option value='manual'>Вручну</option>
                      </select>
                    </label>
                    <label>
                      Категорія каталогу
                      <input
                        value={section.category || ''}
                        onChange={(e) => patchSection(index, { category: e.target.value })}
                      />
                    </label>
                  </>
                ) : null}

                {section.type === 'gallery' ? (
                  <>
                    <label>
                      Заголовок
                      <input
                        value={section.title || ''}
                        onChange={(e) => patchSection(index, { title: e.target.value })}
                      />
                    </label>
                    {(section.images || []).map((img, i) => (
                      <ImageField
                        key={i}
                        value={img}
                        onChange={(url) => {
                          const images = [...(section.images || [])];
                          images[i] = url;
                          patchSection(index, { images });
                        }}
                      />
                    ))}
                    <button
                      type='button'
                      className='admin-btn admin-btn--secondary'
                      onClick={() => patchSection(index, { images: [...(section.images || []), ''] })}
                    >
                      + фото
                    </button>
                  </>
                ) : null}

                {section.type === 'rich-text' ? (
                  <RichTextField
                    label='HTML'
                    value={section.html || ''}
                    onChange={(html) => patchSection(index, { html })}
                    rows={8}
                  />
                ) : null}
              </div>
            ) : null}
          </div>
        );
      })}

      <StickySaveBar
        dirty={dirty}
        saving={saving}
        onSave={() => void (canPublishLive ? save() : save({ requestReview: true }))}
        label={canPublishLive ? 'Опублікувати live' : 'На ревʼю'}
        extra={
          <button
            type='button'
            className='admin-btn admin-btn--secondary'
            disabled={saving}
            onClick={() => void save({ asDraft: true })}
          >
            Чернетка
          </button>
        }
      />
      </div>

      {previewOpen ? (
        <aside
          className={`admin-preview-panel${previewSplit ? ' admin-preview-panel--split' : ''}`}
          aria-label='Попередній перегляд сторінки'
        >
          <div className='admin-preview-toolbar'>
            <strong>Preview</strong>
            <span className='admin-preview-path'>{publicPath}</span>
            {dirty ? <span className='admin-dirty'>є зміни</span> : null}
            <button
              type='button'
              className={`admin-btn admin-btn--secondary${previewMode === 'desktop' ? ' is-active' : ''}`}
              onClick={() => setPreviewMode('desktop')}
            >
              Desktop
            </button>
            <button
              type='button'
              className={`admin-btn admin-btn--secondary${previewMode === 'mobile' ? ' is-active' : ''}`}
              onClick={() => setPreviewMode('mobile')}
            >
              Mobile
            </button>
            <button
              type='button'
              className={`admin-btn admin-btn--secondary${previewSplit ? ' is-active' : ''}`}
              onClick={() => {
                setPreviewSplit((v) => {
                  const next = !v;
                  if (next && !livePreviewPath) void pushLivePreview();
                  return next;
                });
              }}
              title='Live сайт | чернетка редактора'
            >
              Live|Draft
            </button>
            <button
              type='button'
              className='admin-btn admin-btn--secondary'
              onClick={() => {
                if (previewSplit || livePreviewPath) void pushLivePreview();
                else reloadPreview();
              }}
            >
              Оновити
            </button>
            <a href={publicPath} target='_blank' rel='noreferrer' className='admin-btn admin-btn--secondary'>
              ↗
            </a>
          </div>
          {previewSplit ? (
            <div className={`admin-preview-split admin-preview-frame-wrap--${previewMode}`}>
              <div className='admin-preview-col'>
                <div className='admin-preview-col__label'>LIVE (сайт)</div>
                <iframe
                  key={`live-${previewKey}`}
                  className='admin-preview-frame'
                  src={publicPath}
                  title={`Live ${publicPath}`}
                />
              </div>
              <div className='admin-preview-col'>
                <div className='admin-preview-col__label'>
                  DRAFT {livePreviewPath ? '' : '(натисніть Live draft / Оновити)'}
                </div>
                <iframe
                  key={`draft-${previewKey}`}
                  ref={iframeRef}
                  className='admin-preview-frame'
                  src={livePreviewPath || publicPath}
                  title={`Draft ${livePreviewPath || publicPath}`}
                />
              </div>
            </div>
          ) : (
            <div className={`admin-preview-frame-wrap admin-preview-frame-wrap--${previewMode}`}>
              <iframe
                key={previewKey}
                ref={iframeRef}
                className='admin-preview-frame'
                src={livePreviewPath || publicPath}
                title={`Preview ${livePreviewPath || publicPath}`}
              />
            </div>
          )}
        </aside>
      ) : null}
    </div>
  );
}
