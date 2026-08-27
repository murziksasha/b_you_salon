'use client';

import { useState } from 'react';
import { uploadImage, type UploadImageOptions } from '@/lib/admin/uploadImage';
import type { ImagePresetId } from '@/lib/image-presets';
import { purposeFromPreset, type MediaPurpose } from '@/lib/media-purpose';
import { showToast } from './AdminToast';
import { MediaPicker } from './MediaPicker';

interface ImageFieldProps {
  label?: string;
  value: string;
  onChange: (url: string) => void;
  /** Override default upload (uses uploadImage + toast). */
  onUpload?: (file: File) => Promise<string>;
  /** Resize preset for server optimize (product, logo, hero, …). */
  preset?: ImagePresetId | string;
  /** Media library group (defaults from preset). */
  purpose?: MediaPurpose;
  maxWidth?: number;
  maxHeight?: number;
  alt?: string;
  onAltChange?: (alt: string) => void;
  /** Show toast on success (default false — parent save is enough). */
  toastOnSuccess?: boolean;
  /** Allow picking from media library (default true). */
  allowLibrary?: boolean;
}

/** URL + file upload + library picker + optional preview for admin editors. */
export function ImageField({
  label = 'Зображення',
  value,
  onChange,
  onUpload,
  preset,
  purpose,
  maxWidth,
  maxHeight,
  alt,
  onAltChange,
  toastOnSuccess = false,
  allowLibrary = true,
}: ImageFieldProps) {
  const [busy, setBusy] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);

  const resolvedPurpose: MediaPurpose =
    purpose || purposeFromPreset(preset ? String(preset) : undefined);

  async function handleFile(file: File) {
    setBusy(true);
    try {
      if (onUpload) {
        const url = await onUpload(file);
        if (url) onChange(url);
        return;
      }
      const opts: UploadImageOptions = {
        purpose: resolvedPurpose,
      };
      if (preset) opts.preset = preset;
      if (maxWidth != null) opts.maxWidth = maxWidth;
      if (maxHeight != null) opts.maxHeight = maxHeight;

      const { url, error, width, height } = await uploadImage(file, opts);
      if (!url) {
        showToast(error || 'Помилка завантаження', 'error');
        return;
      }
      onChange(url);
      if (toastOnSuccess) {
        const dim = width && height ? ` (${width}×${height})` : '';
        showToast(`Завантажено${dim}`, 'success');
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className='admin-image-field'>
      <label>
        {label} (URL)
        <input value={value} onChange={(e) => onChange(e.target.value)} disabled={busy} />
      </label>
      <div className='admin-row admin-image-actions'>
        <label className='admin-btn admin-btn--secondary' style={{ cursor: busy ? 'wait' : 'pointer' }}>
          {busy ? 'Завантаження…' : 'Завантажити файл'}
          <input
            type='file'
            accept='image/jpeg,image/png,image/webp,image/gif'
            hidden
            disabled={busy}
            onChange={async (e) => {
              const file = e.target.files?.[0];
              e.target.value = '';
              if (!file) return;
              await handleFile(file);
            }}
          />
        </label>
        {allowLibrary ? (
          <button
            type='button'
            className='admin-btn admin-btn--secondary'
            disabled={busy}
            onClick={() => setPickerOpen(true)}
          >
            З бібліотеки
          </button>
        ) : null}
      </div>
      {onAltChange ? (
        <label>
          Alt текст
          <input value={alt || ''} onChange={(e) => onAltChange(e.target.value)} />
        </label>
      ) : null}
      {value ? (
        <div className='admin-image-preview'>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={value} alt={alt || ''} />
        </div>
      ) : null}

      {allowLibrary ? (
        <MediaPicker
          open={pickerOpen}
          onClose={() => setPickerOpen(false)}
          purpose={resolvedPurpose}
          preset={preset}
          onSelect={(item) => {
            onChange(item.url);
            if (onAltChange && item.alt) onAltChange(item.alt);
          }}
        />
      ) : null}
    </div>
  );
}
