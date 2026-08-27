'use client';

import { useState } from 'react';
import { uploadVideo } from '@/lib/admin/uploadImage';
import { showToast } from './AdminToast';
import { MediaPicker } from './MediaPicker';

export type ProductVideoFieldProps = {
  value: string;
  onChange: (url: string) => void;
  disabled?: boolean;
};

export function ProductVideoField({ value, onChange, disabled }: ProductVideoFieldProps) {
  const [busy, setBusy] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);

  async function handleFile(file: File | undefined) {
    if (!file || disabled) return;
    setBusy(true);
    try {
      const { url, error } = await uploadVideo(file, { purpose: 'product' });
      if (!url) {
        showToast(error || 'Помилка завантаження відео', 'error');
        return;
      }
      onChange(url);
      showToast('Відео завантажено', 'success');
    } finally {
      setBusy(false);
    }
  }

  const locked = busy || disabled;

  return (
    <div className='admin-product-video'>
      <div className='admin-gallery-field__label'>Відео-огляд (опційно)</div>
      <div className='admin-row admin-image-actions'>
        <label
          className='admin-btn admin-btn--secondary'
          style={{ cursor: locked ? 'wait' : 'pointer' }}
        >
          {busy ? 'Завантаження…' : 'Завантажити відео'}
          <input
            type='file'
            accept='video/mp4,video/webm,video/quicktime,.mp4,.webm,.mov'
            hidden
            disabled={locked}
            onChange={async (e) => {
              const file = e.target.files?.[0];
              e.target.value = '';
              await handleFile(file);
            }}
          />
        </label>
        <button
          type='button'
          className='admin-btn admin-btn--secondary'
          disabled={locked}
          onClick={() => setPickerOpen(true)}
        >
          З бібліотеки
        </button>
        {value ? (
          <button
            type='button'
            className='admin-btn admin-btn--secondary'
            disabled={locked}
            onClick={() => onChange('')}
            title='Прибрати з товару (файл у бібліотеці лишається)'
          >
            Прибрати
          </button>
        ) : null}
      </div>

      {value ? (
        <div className='admin-product-video__preview'>
          <video src={value} controls preload='metadata' playsInline />
          <span className='admin-hint' title={value}>
            {value}
          </span>
        </div>
      ) : (
        <p className='admin-hint'>MP4 / WebM, до 80 МБ. Одне відео на товар.</p>
      )}

      <MediaPicker
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        purpose='product'
        kind='video'
        onSelect={(item) => {
          onChange(item.url);
          showToast('Відео вибрано', 'success');
        }}
      />
    </div>
  );
}
