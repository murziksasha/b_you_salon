'use client';

import type React from 'react';

export interface PagePreviewPanelProps {
  previewSplit: boolean;
  setPreviewSplit: React.Dispatch<React.SetStateAction<boolean>>;
  publicPath: string;
  dirty: boolean;
  previewMode: 'desktop' | 'mobile';
  setPreviewMode: (mode: 'desktop' | 'mobile') => void;
  livePreviewPath: string | null;
  pushLivePreview: () => Promise<void>;
  reloadPreview: () => void;
  previewKey: number;
  iframeRef: React.RefObject<HTMLIFrameElement | null>;
}

export function PagePreviewPanel({
  previewSplit,
  setPreviewSplit,
  publicPath,
  dirty,
  previewMode,
  setPreviewMode,
  livePreviewPath,
  pushLivePreview,
  reloadPreview,
  previewKey,
  iframeRef,
}: PagePreviewPanelProps) {
  return (
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
  );
}
