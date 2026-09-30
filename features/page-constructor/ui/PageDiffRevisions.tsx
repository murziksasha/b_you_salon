'use client';

import type React from 'react';
import type { Page } from '@/lib/types';
import type { PageDiffLine } from '@/lib/page-draft';
import { publishedPage } from '@/lib/page-draft';
import { showToast } from '@/components/admin/AdminToast';

export interface PageDiffRevisionsProps {
  diffLines: PageDiffLine[];
  revisions: Array<{ id: string; at: string; label?: string }>;
  page: Page;
  liveRef: React.MutableRefObject<Page | null>;
  updatePage: (patch: Partial<Page>) => void;
  resetToLive: () => void;
}

export function PageDiffRevisions({
  diffLines,
  revisions,
  page,
  liveRef,
  updatePage,
  resetToLive,
}: PageDiffRevisionsProps) {
  return (
    <>
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
                {line.kind === 'changed' && (line.field === 'Назва' || line.field === 'Meta description') ? (
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
          {diffLines.length > 24 ? <p className='admin-hint'>…і ще {diffLines.length - 24}</p> : null}
          <button type='button' className='admin-btn admin-btn--secondary admin-btn--sm' onClick={resetToLive}>
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
            {revisions.slice(0, 8).map(r => (
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
    </>
  );
}
