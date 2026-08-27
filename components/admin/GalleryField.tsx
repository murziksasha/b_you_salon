'use client';

import { useState } from 'react';
import { uploadImage, type UploadImageOptions } from '@/lib/admin/uploadImage';
import type { ImagePresetId } from '@/lib/image-presets';
import { purposeFromPreset, type MediaPurpose } from '@/lib/media-purpose';
import { showToast } from './AdminToast';
import { MediaPicker } from './MediaPicker';

export type GalleryFieldProps = {
  label?: string;
  value: string[];
  onChange: (urls: string[]) => void;
  /** Primary image URL — excluded from gallery list when appending. */
  excludeUrl?: string;
  preset?: ImagePresetId | string;
  purpose?: MediaPurpose;
};

function uniqueAppend(existing: string[], incoming: string[], excludeUrl?: string): string[] {
  const seen = new Set(existing);
  if (excludeUrl) seen.add(excludeUrl);
  const next = [...existing];
  for (const url of incoming) {
    const u = url.trim();
    if (!u || seen.has(u)) continue;
    seen.add(u);
    next.push(u);
  }
  return next;
}

/** Multi-image gallery editor: upload many, pick many from library, reorder, remove. */
export function GalleryField({
  label = 'Галерея',
  value,
  onChange,
  excludeUrl,
  preset = 'product',
  purpose,
}: GalleryFieldProps) {
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState('');
  const [pickerOpen, setPickerOpen] = useState(false);

  const resolvedPurpose: MediaPurpose =
    purpose || purposeFromPreset(preset ? String(preset) : undefined);

  function appendUrls(urls: string[]): number {
    const next = uniqueAppend(value, urls, excludeUrl);
    const added = next.length - value.length;
    if (added > 0) onChange(next);
    return added;
  }

  function removeAt(index: number) {
    onChange(value.filter((_, i) => i !== index));
  }

  function move(index: number, dir: -1 | 1) {
    const j = index + dir;
    if (j < 0 || j >= value.length) return;
    const next = [...value];
    const tmp = next[index];
    next[index] = next[j];
    next[j] = tmp;
    onChange(next);
  }

  async function handleFiles(fileList: FileList | null) {
    if (!fileList?.length) return;
    const files = Array.from(fileList);
    setBusy(true);
    const uploaded: string[] = [];
    try {
      const opts: UploadImageOptions = {
        purpose: resolvedPurpose,
        preset,
      };
      for (let i = 0; i < files.length; i++) {
        setProgress(`Завантаження ${i + 1}/${files.length}…`);
        const { url, error } = await uploadImage(files[i], opts);
        if (!url) {
          showToast(error || `Помилка: ${files[i].name}`, 'error');
          continue;
        }
        uploaded.push(url);
      }
      if (uploaded.length) {
        const added = appendUrls(uploaded);
        if (added > 0) {
          showToast(added === 1 ? 'Фото додано' : `Додано фото: ${added}`, 'success');
        }
      }
    } finally {
      setBusy(false);
      setProgress('');
    }
  }

  return (
    <div className='admin-gallery-field'>
      <div className='admin-gallery-field__label'>{label}</div>
      <div className='admin-row admin-image-actions'>
        <label className='admin-btn admin-btn--secondary' style={{ cursor: busy ? 'wait' : 'pointer' }}>
          {busy && progress ? progress : 'Завантажити файли'}
          <input
            type='file'
            accept='image/jpeg,image/png,image/webp,image/gif'
            multiple
            hidden
            disabled={busy}
            onChange={async (e) => {
              const list = e.target.files;
              e.target.value = '';
              await handleFiles(list);
            }}
          />
        </label>
        <button
          type='button'
          className='admin-btn admin-btn--secondary'
          disabled={busy}
          onClick={() => setPickerOpen(true)}
        >
          З бібліотеки
        </button>
      </div>

      {value.length > 0 ? (
        <ul className='admin-gallery-grid'>
          {value.map((url, index) => (
            <li key={`${url}-${index}`} className='admin-gallery-thumb'>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={url} alt='' />
              <div className='admin-gallery-thumb__actions'>
                <button
                  type='button'
                  className='admin-btn admin-btn--tiny admin-btn--secondary'
                  disabled={index === 0 || busy}
                  onClick={() => move(index, -1)}
                  title='Вище'
                  aria-label='Перемістити вище'
                >
                  ↑
                </button>
                <button
                  type='button'
                  className='admin-btn admin-btn--tiny admin-btn--secondary'
                  disabled={index === value.length - 1 || busy}
                  onClick={() => move(index, 1)}
                  title='Нижче'
                  aria-label='Перемістити нижче'
                >
                  ↓
                </button>
                <button
                  type='button'
                  className='admin-btn admin-btn--tiny admin-btn--secondary'
                  disabled={busy}
                  onClick={() => removeAt(index)}
                  title='Прибрати'
                  aria-label='Прибрати з галереї'
                >
                  ×
                </button>
              </div>
              <span className='admin-gallery-thumb__url' title={url}>
                {url}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className='admin-hint'>Ще немає додаткових фото.</p>
      )}

      <span className='admin-hint'>
        Додаткові фото крім головного. Можна завантажити або вибрати кілька одразу.
      </span>

      <MediaPicker
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        multiple
        purpose={resolvedPurpose}
        preset={preset}
        onSelectMany={(items) => {
          const added = appendUrls(items.map((i) => i.url));
          if (added > 0) {
            showToast(added === 1 ? 'Фото додано' : `Додано фото: ${added}`, 'success');
          }
        }}
      />
    </div>
  );
}
