'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { uploadImage, uploadVideo } from '@/lib/admin/uploadImage';
import {
  MEDIA_PURPOSE_IDS,
  MEDIA_PURPOSES,
  purposeFromPreset,
  type MediaPurpose,
} from '@/lib/media-purpose';
import type { MediaKind } from '@/lib/media-index';
import type { ImagePresetId } from '@/lib/image-presets';
import { showToast } from './AdminToast';

export type MediaPickerItem = {
  name: string;
  url: string;
  size: number;
  mtime: string;
  purpose: MediaPurpose;
  kind?: MediaKind;
  tags: string[];
  folderId: string;
  sortOrder: number;
  alt?: string;
  width?: number;
  height?: number;
};

type FolderRow = { id: string; label: string; count: number };

type MediaPickerProps = {
  open: boolean;
  onClose: () => void;
  /** Single-select callback (used when multiple is false). */
  onSelect?: (item: MediaPickerItem) => void;
  /** Multi-select confirm callback (used when multiple is true). */
  onSelectMany?: (items: MediaPickerItem[]) => void;
  /** Allow selecting several images and confirming with a button. */
  multiple?: boolean;
  purpose?: MediaPurpose | 'all';
  /** Filter library by media kind (default image for product photos). */
  kind?: MediaKind | 'all';
  preset?: ImagePresetId | string;
  folderId?: string;
};

export function MediaPicker({
  open,
  onClose,
  onSelect,
  onSelectMany,
  multiple = false,
  purpose: purposeProp = 'all',
  kind: kindProp = 'image',
  preset,
  folderId: folderProp,
}: MediaPickerProps) {
  const defaultPurpose: MediaPurpose | 'all' =
    purposeProp !== 'all'
      ? purposeProp
      : preset
        ? purposeFromPreset(String(preset))
        : 'all';

  const [items, setItems] = useState<MediaPickerItem[]>([]);
  const [folders, setFolders] = useState<FolderRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [purpose, setPurpose] = useState<MediaPurpose | 'all'>(defaultPurpose);
  const [kind, setKind] = useState<MediaKind | 'all'>(kindProp);
  const [folder, setFolder] = useState<string>(folderProp || 'all');
  const [q, setQ] = useState('');
  const [uploading, setUploading] = useState(false);
  /** Selected items keyed by name so confirm survives filter changes. */
  const [selectedMap, setSelectedMap] = useState<Record<string, MediaPickerItem>>({});
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setPurpose(defaultPurpose);
      setKind(kindProp);
      setFolder(folderProp || 'all');
      setQ('');
      setSelectedMap({});
    }
  }, [open, defaultPurpose, folderProp, kindProp]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (purpose && purpose !== 'all') params.set('purpose', purpose);
      if (kind && kind !== 'all') params.set('kind', kind);
      if (folder && folder !== 'all') params.set('folder', folder);
      if (q.trim()) params.set('q', q.trim());
      params.set('sort', 'manual');
      const res = await fetch(`/api/media?${params.toString()}`);
      if (!res.ok) {
        showToast('Не вдалося завантажити медіа', 'error');
        return;
      }
      const json = (await res.json()) as {
        items?: MediaPickerItem[];
        folders?: FolderRow[];
      };
      setItems(json.items || []);
      setFolders(json.folders || []);
    } catch {
      showToast('Мережева помилка', 'error');
    } finally {
      setLoading(false);
    }
  }, [purpose, folder, q, kind]);

  useEffect(() => {
    if (!open) return;
    void load();
  }, [open, load]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  function toggleSelect(item: MediaPickerItem) {
    setSelectedMap((prev) => {
      if (prev[item.name]) {
        const next = { ...prev };
        delete next[item.name];
        return next;
      }
      return { ...prev, [item.name]: item };
    });
  }

  function confirmMany() {
    onSelectMany?.(Object.values(selectedMap));
    onClose();
  }

  async function onUploadFiles(fileList: FileList | null) {
    if (!fileList?.length) return;
    const files = Array.from(fileList);
    setUploading(true);
    try {
      const uploadPurpose: MediaPurpose =
        purpose !== 'all' ? purpose : purposeFromPreset(preset ? String(preset) : undefined);
      const uploadFolder =
        folder !== 'all' && folder !== 'root' ? folder : undefined;
      const wantVideo = kind === 'video';

      const uploaded: MediaPickerItem[] = [];
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const result = wantVideo
          ? await uploadVideo(file, { purpose: uploadPurpose, folderId: uploadFolder })
          : await uploadImage(file, {
              preset,
              purpose: uploadPurpose,
              folderId: uploadFolder,
            });
        if (!result.url) {
          showToast(result.error || `Помилка upload (${file.name})`, 'error');
          continue;
        }
        uploaded.push({
          name: result.url.split('/').pop() || '',
          url: result.url,
          size: 0,
          mtime: new Date().toISOString(),
          purpose: uploadPurpose,
          kind: wantVideo ? 'video' : 'image',
          tags: [],
          folderId: uploadFolder || '',
          sortOrder: 0,
        });
      }

      if (uploaded.length === 0) return;

      if (uploaded.length === 1 && files.length === 1) {
        showToast('Завантажено', 'success');
      } else {
        showToast(`Завантажено: ${uploaded.length}`, 'success');
      }

      await load();

      if (multiple) {
        setSelectedMap((prev) => {
          const next = { ...prev };
          for (const item of uploaded) next[item.name] = item;
          return next;
        });
      } else {
        onSelect?.(uploaded[0]);
        onClose();
      }
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  if (!open) return null;

  const selectedCount = Object.keys(selectedMap).length;

  return (
    <div className='admin-modal-backdrop' role='presentation' onClick={onClose}>
      <div
        className='admin-modal admin-modal--wide'
        role='dialog'
        aria-modal='true'
        aria-label={
          kind === 'video'
            ? multiple
              ? 'Вибір відео'
              : 'Вибір відео'
            : multiple
              ? 'Вибір зображень'
              : 'Вибір зображення'
        }
        onClick={(e) => e.stopPropagation()}
      >
        <div className='admin-modal__head'>
          <h2 className='admin-h2' style={{ margin: 0 }}>
            Медіатека
            {multiple && selectedCount > 0 ? (
              <span className='admin-hint' style={{ fontWeight: 400, marginLeft: 8 }}>
                вибрано: {selectedCount}
              </span>
            ) : null}
          </h2>
          <button type='button' className='admin-btn admin-btn--secondary' onClick={onClose}>
            Закрити
          </button>
        </div>

        <div className='admin-toolbar admin-mb'>
          <label className='admin-inline-label'>
            Папка
            <select
              value={folder}
              onChange={(e) => setFolder(e.target.value)}
              aria-label='Папка'
            >
              <option value='all'>Усі</option>
              <option value='root'>Без папки</option>
              {folders.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.label} ({f.count})
                </option>
              ))}
            </select>
          </label>
          <label className='admin-inline-label'>
            Роль
            <select
              value={purpose}
              onChange={(e) => setPurpose(e.target.value as MediaPurpose | 'all')}
              aria-label='Роль медіа'
            >
              <option value='all'>Усі</option>
              {MEDIA_PURPOSE_IDS.map((id) => (
                <option key={id} value={id}>
                  {MEDIA_PURPOSES[id].label}
                </option>
              ))}
            </select>
          </label>
          {kindProp === 'all' ? (
            <label className='admin-inline-label'>
              Тип
              <select
                value={kind}
                onChange={(e) => setKind(e.target.value as MediaKind | 'all')}
                aria-label='Тип медіа'
              >
                <option value='all'>Усі</option>
                <option value='image'>Фото</option>
                <option value='video'>Відео</option>
              </select>
            </label>
          ) : null}
          <input
            type='search'
            className='admin-grow'
            placeholder='Пошук…'
            value={q}
            onChange={(e) => setQ(e.target.value)}
            aria-label='Пошук медіа'
          />
          <button type='button' className='admin-btn admin-btn--secondary' onClick={() => void load()}>
            Оновити
          </button>
          <label className='admin-btn' style={{ cursor: uploading ? 'wait' : 'pointer' }}>
            {uploading ? 'Завантаження…' : multiple ? 'Завантажити' : 'Завантажити нове'}
            <input
              ref={fileRef}
              type='file'
              accept={
                kind === 'video'
                  ? 'video/mp4,video/webm,video/quicktime,.mp4,.webm,.mov'
                  : 'image/jpeg,image/png,image/webp,image/gif'
              }
              multiple={multiple && kind !== 'video'}
              hidden
              disabled={uploading}
              onChange={(e) => void onUploadFiles(e.target.files)}
            />
          </label>
        </div>

        {multiple ? (
          <p className='admin-hint admin-mb'>
            Клікніть по {kind === 'video' ? 'відео' : 'фото'}, щоб вибрати кілька, потім натисніть
            «Додати».
          </p>
        ) : null}

        {loading ? <p className='admin-hint'>Завантаження…</p> : null}
        {!loading && items.length === 0 ? <p className='admin-hint'>Немає файлів.</p> : null}

        <div className='admin-media-grid admin-media-grid--picker'>
          {items.map((item) => {
            const isSelected = Boolean(selectedMap[item.name]);
            return (
              <button
                key={item.name}
                type='button'
                className={
                  'admin-media-card admin-media-card--pick' +
                  (isSelected ? ' admin-media-card--selected' : '')
                }
                aria-pressed={multiple ? isSelected : undefined}
                onClick={() => {
                  if (multiple) {
                    toggleSelect(item);
                    return;
                  }
                  onSelect?.(item);
                  onClose();
                }}
              >
                {item.kind === 'video' || kind === 'video' ? (
                  <div className='admin-media-video-thumb' aria-hidden>
                    <span>▶</span>
                    <video src={item.url} muted preload='metadata' />
                  </div>
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={item.url} alt={item.alt || item.name} loading='lazy' />
                )}
                <div className='admin-media-meta'>
                  <span title={item.name}>{item.name}</span>
                  <span>{MEDIA_PURPOSES[item.purpose]?.label || item.purpose}</span>
                </div>
              </button>
            );
          })}
        </div>

        {multiple ? (
          <div className='admin-modal__foot'>
            <button type='button' className='admin-btn admin-btn--secondary' onClick={onClose}>
              Скасувати
            </button>
            <button
              type='button'
              className='admin-btn'
              disabled={selectedCount === 0}
              onClick={confirmMany}
            >
              Додати{selectedCount > 0 ? ` (${selectedCount})` : ''}
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
