'use client';

import { useMemo, useState, useEffect } from 'react';
import { AdminShell } from '@/components/admin/AdminShell';
import { showToast } from '@/components/admin/AdminToast';
import { fetchSiteData, saveSiteData } from '@/lib/admin/saveSite';
import { resolveSaveConflict } from '@/lib/admin/handleSaveResult';
import { createId } from '@/lib/id';
import { createDefaultPage } from '@/lib/section-factory';
import { pageSeoHints } from '@/lib/page-seo';
import Link from 'next/link';
import type { Page, SiteData } from '@/lib/types';

export default function AdminPagesList() {
  const [site, setSite] = useState<SiteData | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newSlug, setNewSlug] = useState('');
  const [busy, setBusy] = useState(false);
  const [q, setQ] = useState('');
  const [visFilter, setVisFilter] = useState<'all' | 'visible' | 'hidden' | 'review'>('all');

  async function load() {
    setLoading(true);
    setLoadError(false);
    const data = await fetchSiteData();
    if (data) {
      setSite(data);
      setLoadError(false);
    } else {
      setSite(null);
      setLoadError(true);
      showToast('Не вдалося завантажити дані (потрібна авторизація)', 'error');
    }
    setLoading(false);
  }

  useEffect(() => {
    void load();
  }, []);

  async function persist(next: SiteData, okMsg: string) {
    setBusy(true);
    let result = await saveSiteData(next);
    if (!result.ok && result.conflict) {
      const forced = await resolveSaveConflict(next, result);
      if (forced) result = forced;
      else {
        setBusy(false);
        return false;
      }
    }
    setBusy(false);
    if (result.ok) {
      setSite({ ...next, updatedAt: result.updatedAt || next.updatedAt });
      showToast(okMsg, 'success');
      return true;
    }
    showToast(result.error, 'error');
    return false;
  }

  async function addPage() {
    if (!newTitle || !site) {
      showToast('Введіть назву сторінки', 'error');
      return;
    }
    const base =
      (newSlug || newTitle.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/gi, '')).trim() || 'new-page';
    let slug = base;
    let i = 1;
    while (site.pages.some((p) => p.slug === slug)) slug = `${base}-${i++}`;

    const newPage = createDefaultPage({
      title: newTitle,
      slug,
      email: site.settings?.email || '',
      mapEmbedUrl: site.settings?.mapEmbedUrl || '',
    });

    const next = { ...site, pages: [...site.pages, newPage] };
    if (await persist(next, 'Сторінку створено')) {
      setNewTitle('');
      setNewSlug('');
    }
  }

  async function deletePage(id: string, slug: string) {
    if (!site || slug === '' || !confirm('Видалити сторінку?')) return;
    await persist(
      { ...site, pages: site.pages.filter((p) => p.id !== id) },
      'Сторінку видалено',
    );
  }

  async function toggleVisible(page: Page) {
    if (!site) return;
    const pages = site.pages.map((p) => (p.id === page.id ? { ...p, visible: !p.visible } : p));
    await persist({ ...site, pages }, page.visible ? 'Сторінку приховано' : 'Сторінку опубліковано');
  }

  async function duplicatePage(page: Page) {
    if (!site) return;
    let slug = page.slug ? `${page.slug}-copy` : 'copy';
    let n = 1;
    while (site.pages.some((p) => p.slug === slug)) slug = `${page.slug || 'page'}-copy-${n++}`;

    const copy: Page = {
      ...structuredClone(page),
      id: createId(),
      slug,
      title: `${page.title || page.slug || 'Сторінка'} (копія)`,
      visible: false,
      sections: page.sections.map((s) => ({ ...structuredClone(s), id: createId() })),
    };

    await persist({ ...site, pages: [...site.pages, copy] }, 'Сторінку продубльовано (прихована)');
  }

  const filtered = useMemo(() => {
    if (!site) return [];
    const query = q.trim().toLowerCase();
    return site.pages.filter((p) => {
      if (visFilter === 'visible' && !p.visible) return false;
      if (visFilter === 'hidden' && p.visible) return false;
      if (visFilter === 'review' && !p.reviewRequested) return false;
      if (!query) return true;
      const hay = `${p.title} ${p.slug} ${p.description}`.toLowerCase();
      return hay.includes(query);
    });
  }, [site, q, visFilter]);

  if (loading) {
    return (
      <AdminShell>
        <h1>Сторінки</h1>
        <p className='admin-hint'>Завантаження...</p>
      </AdminShell>
    );
  }

  if (loadError || !site) {
    return (
      <AdminShell>
        <h1>Сторінки</h1>
        <div className='admin-card'>
          <p className='admin-hint admin-login-error'>Не вдалося завантажити список сторінок.</p>
          <button type='button' className='admin-btn' onClick={() => void load()}>
            Спробувати знову
          </button>
        </div>
      </AdminShell>
    );
  }

  return (
    <AdminShell>
      <h1>Сторінки</h1>
      <p className='admin-hint admin-mb-lg'>
        Список сторінок сайту. Відкрийте конструктор, щоб редагувати секції та контент. Ctrl+K — швидкий перехід.
      </p>

      <div className='admin-card admin-form admin-mb-lg'>
        <h2 className='admin-h2'>Нова сторінка</h2>
        <div className='admin-row admin-row--wrap'>
          <input
            className='admin-grow'
            placeholder='Назва нової сторінки'
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            disabled={busy}
          />
          <input
            className='admin-field-sm'
            placeholder='slug (опціонально)'
            value={newSlug}
            onChange={(e) => setNewSlug(e.target.value)}
            disabled={busy}
          />
          <button type='button' className='admin-btn' onClick={() => void addPage()} disabled={busy}>
            + Додати сторінку
          </button>
        </div>
        <small className='admin-hint'>
          Створена сторінка матиме базові секції. Конструктор: Live draft, outline, ревізії, rich text.
        </small>
      </div>

      <div className='admin-card'>
        <div className='admin-row admin-row--wrap admin-mb'>
          <input
            type='search'
            className='admin-field-sm admin-grow'
            placeholder='Пошук: назва, slug…'
            value={q}
            onChange={(e) => setQ(e.target.value)}
            aria-label='Пошук сторінок'
          />
          <select
            className='admin-select'
            value={visFilter}
            onChange={(e) => setVisFilter(e.target.value as typeof visFilter)}
            aria-label='Видимість'
          >
            <option value='all'>Усі ({site.pages.length})</option>
            <option value='visible'>Видимі ({site.pages.filter((p) => p.visible).length})</option>
            <option value='hidden'>Приховані ({site.pages.filter((p) => !p.visible).length})</option>
            <option value='review'>
              На ревʼю ({site.pages.filter((p) => p.reviewRequested).length})
            </option>
          </select>
        </div>

        {!filtered.length ? (
          <div className='admin-empty'>
            <p className='admin-hint'>Нічого не знайдено.</p>
          </div>
        ) : null}

        {filtered.map((page) => {
          const publicPath = page.slug ? `/${page.slug}` : '/';
          const hints = pageSeoHints(page);
          const warns = hints.filter((h) => h.level === 'warn');
          const hasDraft = Boolean(page.draft?.updatedAt);
          return (
            <div key={page.id} className={`admin-page-row${!page.visible ? ' is-hidden-section' : ''}`}>
              <div className='admin-page-row__meta'>
                <strong>
                  {page.title || page.slug || 'Головна'}
                  {page.slug === '' ? ' — головна' : ''}
                </strong>
                <span className='admin-hint'>
                  {publicPath}
                  {!page.visible ? ' · прихована' : ''}
                  {page.contentHtml?.trim() ? ' · HTML-режим' : ''}
                  {hasDraft ? ' · є чернетка' : ''}
                  {' · '}
                  {page.sections.length} секц.
                </span>
                <div className='admin-row admin-row--wrap' style={{ gap: 6, marginTop: 4 }}>
                  {!page.visible ? (
                    <span className='admin-status-badge admin-status-badge--off'>Прихована</span>
                  ) : (
                    <span className='admin-status-badge admin-status-badge--on'>Видима</span>
                  )}
                  {hasDraft ? <span className='admin-wf-badge admin-wf-badge--waiting'>Чернетка</span> : null}
                  {page.reviewRequested ? (
                    <span className='admin-wf-badge admin-wf-badge--waiting'>
                      Ревʼю{page.reviewRequestedBy ? ` · ${page.reviewRequestedBy}` : ''}
                    </span>
                  ) : null}
                  {page.contentHtml?.trim() ? (
                    <span className='admin-wf-badge admin-wf-badge--called'>HTML</span>
                  ) : null}
                  {warns.length > 0 ? (
                    <span className='admin-wf-badge admin-wf-badge--stale' title={warns.map((w) => w.message).join('\n')}>
                      SEO {warns.length}
                    </span>
                  ) : null}
                </div>
              </div>
              <div className='admin-row admin-row--wrap'>
                <label className='admin-check'>
                  <input
                    type='checkbox'
                    checked={page.visible}
                    disabled={busy}
                    onChange={() => void toggleVisible(page)}
                  />
                  видима
                </label>
                <Link href={`/admin/pages/${page.slug || 'home'}`} className='admin-btn admin-btn--secondary'>
                  Конструктор
                </Link>
                <a href={publicPath} target='_blank' rel='noreferrer' className='admin-btn admin-btn--secondary'>
                  ↗
                </a>
                <button
                  type='button'
                  className='admin-btn admin-btn--secondary'
                  disabled={busy}
                  onClick={() => void duplicatePage(page)}
                  title='Дублювати'
                >
                  ⧉
                </button>
                {page.slug !== '' ? (
                  <button
                    type='button'
                    className='admin-btn admin-btn--danger'
                    disabled={busy}
                    onClick={() => void deletePage(page.id, page.slug)}
                  >
                    ×
                  </button>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    </AdminShell>
  );
}
