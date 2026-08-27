'use client';

import { useState } from 'react';
import { uploadImage } from '@/lib/admin/uploadImage';
import { reorderItems } from '@/lib/admin/reorder';
import {
  PRODUCT_GALLERY_MAX,
  productFieldsFromGallery,
  productGalleryFromFields,
} from '@/lib/media-usage';
import type { Product } from '@/lib/types';
import { showToast } from './AdminToast';
import { MediaPicker } from './MediaPicker';
import { ProductVideoField } from './ProductVideoField';

export type ProductMediaEditorProps = {
  product: Pick<Product, 'image' | 'images' | 'video'>;
  onChange: (patch: Partial<Pick<Product, 'image' | 'images' | 'video'>>) => void;
  disabled?: boolean;
};

function uniqueAppend(existing: string[], incoming: string[], max: number): string[] {
  const seen = new Set(existing);
  const next = [...existing];
  for (const url of incoming) {
    const u = url.trim();
    if (!u || seen.has(u)) continue;
    if (next.length >= max) break;
    seen.add(u);
    next.push(u);
  }
  return next;
}

/** Unified product photos (first = primary) + optional review video. */
export function ProductMediaEditor({ product, onChange, disabled }: ProductMediaEditorProps) {
  const gallery = productGalleryFromFields(product);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState('');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  function commitGallery(next: string[]) {
    const fields = productFieldsFromGallery(next);
    onChange(fields);
  }

  function appendUrls(urls: string[]): number {
    const next = uniqueAppend(gallery, urls, PRODUCT_GALLERY_MAX);
    const added = next.length - gallery.length;
    if (added > 0) commitGallery(next);
    if (gallery.length + urls.length > PRODUCT_GALLERY_MAX && added < urls.length) {
      showToast(`Максимум ${PRODUCT_GALLERY_MAX} фото`, 'info');
    }
    return added;
  }

  function removeAt(index: number) {
    commitGallery(gallery.filter((_, i) => i !== index));
  }

  function makePrimary(index: number) {
    if (index <= 0 || index >= gallery.length) return;
    const next = [...gallery];
    const [item] = next.splice(index, 1);
    next.unshift(item);
    commitGallery(next);
  }

  function move(index: number, dir: -1 | 1) {
    const j = index + dir;
    if (j < 0 || j >= gallery.length) return;
    commitGallery(reorderItems(gallery, index, j));
  }

  async function handleFiles(fileList: FileList | null) {
    if (!fileList?.length || disabled) return;
    const files = Array.from(fileList);
    setBusy(true);
    const uploaded: string[] = [];
    try {
      for (let i = 0; i < files.length; i++) {
        setProgress(`Завантаження ${i + 1}/${files.length}…`);
        const { url, error } = await uploadImage(files[i], {
          purpose: 'product',
          preset: 'product',
        });
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

  const locked = busy || disabled;

  return (
    <div className='admin-product-media'>
      <div className='admin-gallery-field'>
        <div className='admin-gallery-field__label'>Фото товару</div>
        <div className='admin-row admin-image-actions'>
          <label
            className='admin-btn admin-btn--secondary'
            style={{ cursor: locked ? 'wait' : 'pointer' }}
          >
            {busy && progress ? progress : 'Завантажити'}
            <input
              type='file'
              accept='image/jpeg,image/png,image/webp,image/gif'
              multiple
              hidden
              disabled={locked}
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
            disabled={locked}
            onClick={() => setPickerOpen(true)}
          >
            З бібліотеки
          </button>
          <span className='admin-hint'>
            {gallery.length}/{PRODUCT_GALLERY_MAX} · перше = головне · перетягніть для порядку
          </span>
        </div>

        {gallery.length > 0 ? (
          <ul className='admin-gallery-grid admin-gallery-grid--dnd'>
            {gallery.map((url, index) => {
              const isPrimary = index === 0;
              return (
                <li
                  key={`${url}-${index}`}
                  className={
                    'admin-gallery-thumb' +
                    (isPrimary ? ' is-primary' : '') +
                    (dragIndex === index ? ' is-dragging' : '') +
                    (dragOverIndex === index && dragIndex !== index ? ' is-drop-target' : '')
                  }
                  draggable={!locked}
                  onDragStart={(e) => {
                    if (locked) return;
                    setDragIndex(index);
                    e.dataTransfer.effectAllowed = 'move';
                    e.dataTransfer.setData('text/plain', String(index));
                  }}
                  onDragOver={(e) => {
                    e.preventDefault();
                    if (dragIndex == null || dragIndex === index) return;
                    setDragOverIndex(index);
                  }}
                  onDragLeave={() => {
                    setDragOverIndex((cur) => (cur === index ? null : cur));
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    if (dragIndex == null || dragIndex === index) {
                      setDragIndex(null);
                      setDragOverIndex(null);
                      return;
                    }
                    commitGallery(reorderItems(gallery, dragIndex, index));
                    setDragIndex(null);
                    setDragOverIndex(null);
                  }}
                  onDragEnd={() => {
                    setDragIndex(null);
                    setDragOverIndex(null);
                  }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={url} alt='' title={url} />
                  {isPrimary ? <span className='admin-gallery-thumb__badge'>Головне</span> : null}
                  <span className='admin-gallery-thumb__order' aria-hidden>
                    {index + 1}
                  </span>
                  <div className='admin-gallery-thumb__actions'>
                    <span className='admin-drag-handle' title='Перетягніть' aria-hidden>
                      ⠿
                    </span>
                    <button
                      type='button'
                      className='admin-btn admin-btn--tiny admin-btn--secondary'
                      disabled={index === 0 || locked}
                      onClick={() => move(index, -1)}
                      title='Ліворуч'
                      aria-label='Перемістити ліворуч'
                    >
                      ←
                    </button>
                    <button
                      type='button'
                      className='admin-btn admin-btn--tiny admin-btn--secondary'
                      disabled={index === gallery.length - 1 || locked}
                      onClick={() => move(index, 1)}
                      title='Праворуч'
                      aria-label='Перемістити праворуч'
                    >
                      →
                    </button>
                    {!isPrimary ? (
                      <button
                        type='button'
                        className='admin-btn admin-btn--tiny admin-btn--secondary'
                        disabled={locked}
                        onClick={() => makePrimary(index)}
                        title='Зробити головним'
                        aria-label='Зробити головним'
                      >
                        ★
                      </button>
                    ) : null}
                    <button
                      type='button'
                      className='admin-btn admin-btn--tiny admin-btn--secondary'
                      disabled={locked}
                      onClick={() => removeAt(index)}
                      title='Прибрати з товару (файл у бібліотеці лишається)'
                      aria-label='Прибрати з товару'
                    >
                      ×
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className='admin-hint'>Ще немає фото — завантажте або виберіть з бібліотеки.</p>
        )}

        <span className='admin-hint'>
          × лише відв&apos;язує від картки. Файли з бібліотеки видаляються тільки при
          видаленні товару (якщо більше ніде не використовуються).
        </span>
      </div>

      <ProductVideoField
        value={product.video || ''}
        onChange={(video) => onChange({ video: video || undefined })}
        disabled={locked}
      />

      <MediaPicker
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        multiple
        purpose='product'
        preset='product'
        kind='image'
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
