'use client';

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type DragEvent as ReactDragEvent,
} from 'react';
import { uploadImage } from '@/lib/admin/uploadImage';
import { parseRetryAfterSeconds, rateLimitMessage } from '@/lib/admin/rateLimitUi';
import { reorderItems } from '@/lib/admin/reorder';
import {
  IMAGE_PRESETS,
  IMAGE_PRESET_IDS,
  type ImagePresetId,
} from '@/lib/image-presets';
import {
  MEDIA_PURPOSE_IDS,
  MEDIA_PURPOSES,
  purposeFromPreset,
  type MediaPurpose,
} from '@/lib/media-purpose';
import type { MediaKind } from '@/lib/media-index';
import type { MediaRef } from '@/lib/media-usage';
import { showToast } from './AdminToast';

const MEDIA_NAMES_MIME = 'application/x-media-names';

interface MediaItem {
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
  focusX?: number;
  focusY?: number;
  width?: number;
  height?: number;
  usedBy?: MediaRef[];
  usageTooltip?: string;
}

interface FolderRow {
  id: string;
  label: string;
  sortOrder: number;
  count: number;
}

type FolderFilter = 'all' | 'root' | string;
type SortMode = 'mtime' | 'name' | 'manual';

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function parseMediaNames(dt: DataTransfer): string[] {
  try {
    const raw = dt.getData(MEDIA_NAMES_MIME) || dt.getData('text/plain');
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((n): n is string => typeof n === 'string' && n.trim() !== '');
  } catch {
    return [];
  }
}

export function MediaLibrary() {
  const [items, setItems] = useState<MediaItem[]>([]);
  const [folders, setFolders] = useState<FolderRow[]>([]);
  const [counts, setCounts] = useState({ all: 0, root: 0 });
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [purpose, setPurpose] = useState<MediaPurpose | 'all'>('all');
  const [kindFilter, setKindFilter] = useState<MediaKind | 'all'>('all');
  const [folder, setFolder] = useState<FolderFilter>('all');
  const [sort, setSort] = useState<SortMode>('mtime');
  const [uploading, setUploading] = useState(false);
  const [preset, setPreset] = useState<ImagePresetId>('default');
  const [uploadPurpose, setUploadPurpose] = useState<MediaPurpose>('other');
  const [tagsInput, setTagsInput] = useState('');
  const [newFolderLabel, setNewFolderLabel] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const [editPurpose, setEditPurpose] = useState<MediaPurpose>('other');
  const [editTags, setEditTags] = useState('');
  const [editFolderId, setEditFolderId] = useState('');
  const [editAlt, setEditAlt] = useState('');
  const [editFocusX, setEditFocusX] = useState('50');
  const [editFocusY, setEditFocusY] = useState('50');
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [bulkFolderId, setBulkFolderId] = useState('');
  const [folderDropTarget, setFolderDropTarget] = useState<string | null>(null);
  const [moving, setMoving] = useState(false);
  const [dragMoveActive, setDragMoveActive] = useState(false);
  const [orphanOnly, setOrphanOnly] = useState(false);
  const [replaceTarget, setReplaceTarget] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const replaceRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (purpose !== 'all') params.set('purpose', purpose);
      if (kindFilter !== 'all') params.set('kind', kindFilter);
      if (q.trim()) params.set('q', q.trim());
      if (folder !== 'all') params.set('folder', folder);
      params.set('sort', sort);
      params.set('usage', '1');
      const res = await fetch(`/api/media?${params.toString()}`);
      if (!res.ok) {
        showToast('Не вдалося завантажити медіа', 'error');
        return;
      }
      const json = (await res.json()) as {
        items?: MediaItem[];
        folders?: FolderRow[];
        counts?: { all?: number; root?: number };
      };
      setItems(json.items || []);
      setFolders(json.folders || []);
      setCounts({
        all: json.counts?.all ?? 0,
        root: json.counts?.root ?? 0,
      });
    } catch {
      showToast('Мережева помилка', 'error');
    } finally {
      setLoading(false);
    }
  }, [purpose, kindFilter, q, folder, sort]);

  useEffect(() => {
    setLoading(true);
    void load();
  }, [load]);

  useEffect(() => {
    setUploadPurpose(purposeFromPreset(preset));
  }, [preset]);

  const displayItems = orphanOnly
    ? items.filter((i) => !i.usedBy || i.usedBy.length === 0)
    : items;

  async function replaceInPlace(name: string, file: File) {
    const fd = new FormData();
    fd.set('file', file);
    fd.set('replaceName', name);
    fd.set('preset', preset);
    try {
      const res = await fetch('/api/upload', { method: 'POST', body: fd });
      if (!res.ok) {
        showToast('Не вдалося замінити файл', 'error');
        return;
      }
      showToast('Файл замінено (URL той самий). Оновіть публічну сторінку (Ctrl+F5).', 'success');
      await load();
    } catch {
      showToast('Мережева помилка', 'error');
    }
  }

  async function bulkFillAltFromName() {
    const targets = displayItems.filter((i) => !i.alt?.trim());
    if (!targets.length) {
      showToast('Усі alt уже заповнені', 'info');
      return;
    }
    let n = 0;
    for (const item of targets) {
      const alt = item.name.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ').trim();
      try {
        const res = await fetch('/api/media', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: item.name, alt }),
        });
        if (res.ok) n++;
      } catch {
        /* skip */
      }
    }
    showToast(`Заповнено alt: ${n}`, 'success');
    await load();
  }

  async function purgeOrphans() {
    const orphans = items.filter((i) => !i.usedBy || i.usedBy.length === 0).map((i) => i.name);
    if (!orphans.length) {
      showToast('Немає невикористаних файлів', 'info');
      return;
    }
    if (!confirm(`Видалити ${orphans.length} невикористаних файлів?`)) return;
    try {
      const res = await fetch('/api/media/purge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ names: orphans }),
      });
      if (!res.ok) {
        showToast('Помилка очищення', 'error');
        return;
      }
      const json = (await res.json().catch(() => ({}))) as { deleted?: string[] };
      showToast(`Видалено: ${json.deleted?.length || 0}`, 'success');
      await load();
    } catch {
      showToast('Мережева помилка', 'error');
    }
  }

  const uploadFolderId =
    folder !== 'all' && folder !== 'root' ? folder : '';

  async function onUpload(file: File | null) {
    if (!file) return;
    setUploading(true);
    try {
      const { url, error, width, height } = await uploadImage(file, {
        preset,
        purpose: uploadPurpose,
        tags: tagsInput,
        folderId: uploadFolderId || undefined,
      });
      if (!url) {
        showToast(error || 'Помилка upload', 'error');
        return;
      }
      const dim = width && height ? ` · ${width}×${height}` : '';
      const fmt = url.endsWith('.webp')
        ? 'JPEG → WebP'
        : url.endsWith('.png')
          ? 'PNG'
          : 'OK';
      showToast(`Завантажено (${fmt}${dim})`, 'success');
      await load();
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  async function copyUrl(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      showToast('URL скопійовано', 'success');
    } catch {
      showToast(url, 'info');
    }
  }

  async function remove(name: string, usageTooltip?: string) {
    if (usageTooltip) {
      showToast(usageTooltip, 'error');
      return;
    }
    if (!confirm(`Видалити ${name}?`)) return;
    try {
      const res = await fetch('/api/media', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      if (!res.ok) {
        if (res.status === 429) {
          const sec = parseRetryAfterSeconds(res, 60);
          showToast(rateLimitMessage(sec, 'upload'), 'error');
          return;
        }
        if (res.status === 409) {
          const json = (await res.json().catch(() => ({}))) as { message?: string };
          showToast(json.message || 'Файл використовується на сайті', 'error');
          return;
        }
        showToast('Не вдалося видалити', 'error');
        return;
      }
      showToast('Видалено', 'success');
      setSelected((prev) => {
        if (!prev.has(name)) return prev;
        const next = new Set(prev);
        next.delete(name);
        return next;
      });
      await load();
    } catch {
      showToast('Мережева помилка', 'error');
    }
  }

  async function createFolder() {
    const label = newFolderLabel.trim();
    if (!label) return;
    try {
      const res = await fetch('/api/media/folders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ label }),
      });
      if (!res.ok) {
        showToast('Не вдалося створити папку', 'error');
        return;
      }
      const json = (await res.json()) as { folder?: FolderRow };
      setNewFolderLabel('');
      showToast('Папку створено', 'success');
      if (json.folder?.id) setFolder(json.folder.id);
      await load();
    } catch {
      showToast('Мережева помилка', 'error');
    }
  }

  async function renameFolder(id: string, label: string) {
    const next = label.trim();
    if (!next) return;
    try {
      const res = await fetch('/api/media/folders', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, label: next }),
      });
      if (!res.ok) {
        showToast('Не вдалося перейменувати', 'error');
        return;
      }
      showToast('Перейменовано', 'success');
      await load();
    } catch {
      showToast('Мережева помилка', 'error');
    }
  }

  async function deleteFolder(id: string, label: string) {
    if (
      !confirm(
        `Видалити папку «${label}»? Файли залишаться в «Без папки» (URL не зміняться).`,
      )
    ) {
      return;
    }
    try {
      const res = await fetch('/api/media/folders', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      if (!res.ok) {
        showToast('Не вдалося видалити папку', 'error');
        return;
      }
      if (folder === id) setFolder('all');
      showToast('Папку видалено', 'success');
      await load();
    } catch {
      showToast('Мережева помилка', 'error');
    }
  }

  function startEdit(item: MediaItem) {
    setEditing(item.name);
    setEditPurpose(item.purpose || 'other');
    setEditTags((item.tags || []).join(', '));
    setEditFolderId(item.folderId || '');
    setEditAlt(item.alt || '');
    setEditFocusX(String(item.focusX ?? 50));
    setEditFocusY(String(item.focusY ?? 50));
  }

  async function saveEdit(name: string) {
    try {
      const fx = Number(editFocusX);
      const fy = Number(editFocusY);
      const res = await fetch('/api/media', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          purpose: editPurpose,
          tags: editTags,
          folderId: editFolderId || 'root',
          alt: editAlt,
          focusX: Number.isFinite(fx) ? fx : 50,
          focusY: Number.isFinite(fy) ? fy : 50,
        }),
      });
      if (!res.ok) {
        showToast('Не вдалося зберегти метадані', 'error');
        return;
      }
      showToast('Збережено', 'success');
      setEditing(null);
      await load();
    } catch {
      showToast('Мережева помилка', 'error');
    }
  }

  async function moveNamesToFolder(names: string[], targetFolderId: string) {
    const unique = [...new Set(names.filter(Boolean))];
    if (unique.length === 0) return;

    const normalizedTarget =
      targetFolderId === 'root' || targetFolderId === '__root' ? '' : targetFolderId;

    const alreadyThere = unique.every((name) => {
      const item = items.find((i) => i.name === name);
      const current = item?.folderId || '';
      return current === normalizedTarget;
    });
    if (alreadyThere && unique.every((n) => items.some((i) => i.name === n))) {
      showToast('Уже в цій папці', 'info');
      return;
    }

    setMoving(true);
    try {
      const res = await fetch('/api/media', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          names: unique,
          folderId: normalizedTarget || 'root',
        }),
      });
      if (!res.ok) {
        if (res.status === 429) {
          const sec = parseRetryAfterSeconds(res, 60);
          showToast(rateLimitMessage(sec, 'upload'), 'error');
          return;
        }
        showToast('Не вдалося перемістити', 'error');
        return;
      }
      const json = (await res.json()) as { moved?: number };
      const n = json.moved ?? unique.length;
      showToast(
        n === 1 ? 'Переміщено 1 файл' : `Переміщено ${n} файлів`,
        'success',
      );
      setSelected(new Set());
      await load();
    } catch {
      showToast('Мережева помилка', 'error');
    } finally {
      setMoving(false);
    }
  }

  async function persistOrder(nextItems: MediaItem[]) {
    const orderedNames = nextItems.map((i) => i.name);
    const reorderFolderId =
      folder === 'all' ? '' : folder === 'root' ? '' : folder;
    try {
      const res = await fetch('/api/media', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderedNames, reorderFolderId }),
      });
      if (!res.ok) {
        showToast('Не вдалося зберегти порядок', 'error');
        await load();
        return;
      }
    } catch {
      showToast('Мережева помилка', 'error');
      await load();
    }
  }

  function onReorder(from: number, to: number) {
    if (sort !== 'manual') return;
    const next = reorderItems(items, from, to);
    setItems(next);
    void persistOrder(next);
  }

  function toggleSelect(name: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }

  function selectAllVisible() {
    setSelected(new Set(items.map((i) => i.name)));
  }

  function clearSelection() {
    setSelected(new Set());
  }

  function onCardDragStart(e: ReactDragEvent, item: MediaItem, index: number) {
    const target = e.target as HTMLElement;
    if (target.closest('button, input, select, textarea, label, a')) {
      e.preventDefault();
      return;
    }
    if (editing === item.name) {
      e.preventDefault();
      return;
    }

    const isReorderHandle = Boolean(target.closest('.admin-drag-handle'));
    if (isReorderHandle && canDnD) {
      setDragIndex(index);
      setDragMoveActive(false);
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', item.name);
      return;
    }

    // Folder move: selected set if this card is selected, else single file
    const names =
      selected.has(item.name) && selected.size > 0
        ? [...selected]
        : [item.name];
    setDragMoveActive(true);
    setDragIndex(null);
    e.dataTransfer.effectAllowed = 'move';
    const payload = JSON.stringify(names);
    e.dataTransfer.setData(MEDIA_NAMES_MIME, payload);
    e.dataTransfer.setData('text/plain', payload);
  }

  function onCardDragEnd() {
    setDragIndex(null);
    setDragOverIndex(null);
    setFolderDropTarget(null);
    setDragMoveActive(false);
  }

  function onFolderDragOver(e: ReactDragEvent, targetId: string) {
    if (!dragMoveActive && !e.dataTransfer.types.includes(MEDIA_NAMES_MIME)) {
      // Still allow when types list has text/plain from our drag
      const types = [...e.dataTransfer.types];
      if (!types.includes(MEDIA_NAMES_MIME) && !types.includes('text/plain')) return;
    }
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setFolderDropTarget(targetId);
  }

  function onFolderDragLeave(e: ReactDragEvent, targetId: string) {
    const related = e.relatedTarget as Node | null;
    if (related && (e.currentTarget as HTMLElement).contains(related)) return;
    setFolderDropTarget((cur) => (cur === targetId ? null : cur));
  }

  function onFolderDrop(e: ReactDragEvent, targetId: string) {
    e.preventDefault();
    e.stopPropagation();
    setFolderDropTarget(null);
    setDragMoveActive(false);
    const names = parseMediaNames(e.dataTransfer);
    if (names.length === 0) return;
    void moveNamesToFolder(names, targetId === 'root' ? '' : targetId);
  }

  const canDnD = sort === 'manual' && folder !== 'all';
  const totalBytes = items.reduce((s, i) => s + i.size, 0);
  const selectedCount = selected.size;

  return (
    <div className='admin-media-layout'>
      <aside className='admin-media-folders admin-card'>
        <h2 className='admin-h2' style={{ marginTop: 0 }}>
          Папки
        </h2>
        <button
          type='button'
          className={`admin-folder-item${folder === 'all' ? ' is-active' : ''}`}
          onClick={() => setFolder('all')}
        >
          <span>Усі файли</span>
          <span className='admin-folder-count'>{counts.all}</span>
        </button>
        <button
          type='button'
          className={`admin-folder-item${folder === 'root' ? ' is-active' : ''}${
            folderDropTarget === 'root' ? ' is-drop-target' : ''
          }`}
          onClick={() => setFolder('root')}
          onDragOver={(e) => onFolderDragOver(e, 'root')}
          onDragLeave={(e) => onFolderDragLeave(e, 'root')}
          onDrop={(e) => onFolderDrop(e, 'root')}
        >
          <span>Без папки</span>
          <span className='admin-folder-count'>{counts.root}</span>
        </button>
        {folders.map((f) => (
          <div
            key={f.id}
            className={`admin-folder-row${folderDropTarget === f.id ? ' is-drop-target' : ''}`}
            onDragOver={(e) => onFolderDragOver(e, f.id)}
            onDragLeave={(e) => onFolderDragLeave(e, f.id)}
            onDrop={(e) => onFolderDrop(e, f.id)}
          >
            <button
              type='button'
              className={`admin-folder-item${folder === f.id ? ' is-active' : ''}${
                folderDropTarget === f.id ? ' is-drop-target' : ''
              }`}
              onClick={() => setFolder(f.id)}
              onDragOver={(e) => onFolderDragOver(e, f.id)}
              onDragLeave={(e) => onFolderDragLeave(e, f.id)}
              onDrop={(e) => onFolderDrop(e, f.id)}
            >
              <span title={f.label}>{f.label}</span>
              <span className='admin-folder-count'>{f.count}</span>
            </button>
            <button
              type='button'
              className='admin-btn admin-btn--secondary admin-btn--tiny'
              title='Перейменувати'
              onClick={() => {
                const label = prompt('Назва папки', f.label);
                if (label != null) void renameFolder(f.id, label);
              }}
            >
              ✎
            </button>
            <button
              type='button'
              className='admin-btn admin-btn--danger admin-btn--tiny'
              title='Видалити папку'
              onClick={() => void deleteFolder(f.id, f.label)}
            >
              ×
            </button>
          </div>
        ))}
        <div className='admin-folder-create'>
          <input
            value={newFolderLabel}
            onChange={(e) => setNewFolderLabel(e.target.value)}
            placeholder='Нова папка…'
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                void createFolder();
              }
            }}
          />
          <button type='button' className='admin-btn' onClick={() => void createFolder()}>
            +
          </button>
        </div>
        <p className='admin-hint' style={{ marginBottom: 0 }}>
          Віртуальні папки: URL файлів не змінюються. Перетягніть файл на папку,
          використайте виділення або кнопку «Мета».
        </p>
      </aside>

      <div className='admin-card admin-form'>
        <div className='admin-row admin-row--between admin-mb'>
          <h2 className='admin-h2' style={{ margin: 0 }}>
            Файли
          </h2>
          <span className='admin-hint' style={{ margin: 0 }}>
            {displayItems.length}/{items.length} у вигляді · {formatBytes(totalBytes)}
          </span>
        </div>

        <div className='admin-media-chips admin-mb' role='tablist' aria-label='Тип медіа'>
          <button
            type='button'
            role='tab'
            className={`admin-chip${kindFilter === 'all' ? ' admin-chip--active' : ''}`}
            aria-selected={kindFilter === 'all'}
            onClick={() => setKindFilter('all')}
          >
            Усі типи
          </button>
          <button
            type='button'
            role='tab'
            className={`admin-chip${kindFilter === 'image' ? ' admin-chip--active' : ''}`}
            aria-selected={kindFilter === 'image'}
            onClick={() => setKindFilter('image')}
          >
            Фото
          </button>
          <button
            type='button'
            role='tab'
            className={`admin-chip${kindFilter === 'video' ? ' admin-chip--active' : ''}`}
            aria-selected={kindFilter === 'video'}
            onClick={() => setKindFilter('video')}
          >
            Відео
          </button>
        </div>

        <div className='admin-media-chips admin-mb' role='tablist' aria-label='Роль зображення'>
          <button
            type='button'
            role='tab'
            className={`admin-chip${purpose === 'all' ? ' admin-chip--active' : ''}`}
            aria-selected={purpose === 'all'}
            onClick={() => setPurpose('all')}
          >
            Усі ролі
          </button>
          {MEDIA_PURPOSE_IDS.map((id) => (
            <button
              key={id}
              type='button'
              role='tab'
              className={`admin-chip${purpose === id ? ' admin-chip--active' : ''}`}
              aria-selected={purpose === id}
              title={MEDIA_PURPOSES[id].description}
              onClick={() => setPurpose(id)}
            >
              {MEDIA_PURPOSES[id].label}
            </button>
          ))}
        </div>

        <div className='admin-toolbar admin-mb admin-row--wrap'>
          <button
            type='button'
            className={`admin-btn admin-btn--secondary${orphanOnly ? ' is-active' : ''}`}
            onClick={() => setOrphanOnly((v) => !v)}
          >
            Лише невикористані
          </button>
          <button type='button' className='admin-btn admin-btn--secondary' onClick={() => void bulkFillAltFromName()}>
            Alt з назви
          </button>
          <button type='button' className='admin-btn admin-btn--danger' onClick={() => void purgeOrphans()}>
            Очистити orphans
          </button>
          <input
            ref={replaceRef}
            type='file'
            accept='image/*,video/*'
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f && replaceTarget) void replaceInPlace(replaceTarget, f);
              setReplaceTarget(null);
              e.target.value = '';
            }}
          />
          <label className='admin-inline-label'>
            Розмір
            <select
              value={preset}
              onChange={(e) => setPreset(e.target.value as ImagePresetId)}
              disabled={uploading}
              aria-label='Пресет розміру зображення'
              title={IMAGE_PRESETS[preset].description}
            >
              {IMAGE_PRESET_IDS.map((id) => (
                <option key={id} value={id}>
                  {IMAGE_PRESETS[id].label}
                </option>
              ))}
            </select>
          </label>
          <label className='admin-inline-label'>
            Роль
            <select
              value={uploadPurpose}
              onChange={(e) => setUploadPurpose(e.target.value as MediaPurpose)}
              disabled={uploading}
              aria-label='Роль для нового файлу'
            >
              {MEDIA_PURPOSE_IDS.map((id) => (
                <option key={id} value={id}>
                  {MEDIA_PURPOSES[id].label}
                </option>
              ))}
            </select>
          </label>
          <label className='admin-inline-label'>
            Сортування
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as SortMode)}
              aria-label='Сортування'
            >
              <option value='mtime'>Новіші спочатку</option>
              <option value='name'>За назвою</option>
              <option value='manual'>Вручну (DnD)</option>
            </select>
          </label>
          <label className='admin-inline-label admin-grow'>
            Теги
            <input
              value={tagsInput}
              onChange={(e) => setTagsInput(e.target.value)}
              placeholder='tv, coffee…'
              disabled={uploading}
            />
          </label>
          <label className='admin-btn' style={{ cursor: uploading ? 'wait' : 'pointer' }}>
            {uploading ? 'Завантаження…' : 'Завантажити'}
            <input
              ref={fileRef}
              type='file'
              accept='image/jpeg,image/png,image/webp,image/gif'
              hidden
              disabled={uploading}
              onChange={(e) => void onUpload(e.target.files?.[0] ?? null)}
            />
          </label>
        </div>

        {sort === 'manual' && folder === 'all' ? (
          <p className='admin-hint admin-mb'>
            Для ручного порядку оберіть папку (або «Без папки») зліва.
          </p>
        ) : null}

        <div className='admin-toolbar admin-mb'>
          <input
            type='search'
            className='admin-grow'
            placeholder='Пошук за назвою / тегами…'
            value={q}
            onChange={(e) => setQ(e.target.value)}
            aria-label='Пошук медіа'
          />
          <button type='button' className='admin-btn admin-btn--secondary' onClick={() => void load()}>
            Оновити
          </button>
        </div>

        {selectedCount > 0 ? (
          <div
            className='admin-media-bulk-bar admin-mb'
            role='region'
            aria-label='Дії з виділеними файлами'
          >
            <span className='admin-media-bulk-count' aria-live='polite'>
              Обрано {selectedCount}
            </span>
            <label className='admin-inline-label'>
              Папка
              <select
                value={bulkFolderId}
                onChange={(e) => setBulkFolderId(e.target.value)}
                disabled={moving}
                aria-label='Цільова папка для переміщення'
              >
                <option value=''>Без папки</option>
                {folders.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.label}
                  </option>
                ))}
              </select>
            </label>
            <button
              type='button'
              className='admin-btn'
              disabled={moving}
              onClick={() => void moveNamesToFolder([...selected], bulkFolderId)}
            >
              {moving ? 'Переміщення…' : 'Перемістити'}
            </button>
            <button
              type='button'
              className='admin-btn admin-btn--secondary'
              disabled={moving || items.length === 0}
              onClick={selectAllVisible}
            >
              Обрати всі видимі
            </button>
            <button
              type='button'
              className='admin-btn admin-btn--secondary'
              disabled={moving}
              onClick={clearSelection}
            >
              Зняти виділення
            </button>
          </div>
        ) : null}

        {loading ? <p className='admin-hint'>Завантаження…</p> : null}
        {!loading && displayItems.length === 0 ? (
          <p className='admin-hint'>{orphanOnly ? 'Немає невикористаних файлів.' : 'Немає файлів.'}</p>
        ) : null}

        <div className='admin-media-grid'>
          {displayItems.map((item, index) => {
            const isSelected = selected.has(item.name);
            return (
              <div
                key={item.name}
                className={`admin-media-card${
                  dragIndex === index ? ' is-dragging' : ''
                }${dragOverIndex === index && dragIndex !== index ? ' is-drop-target' : ''}${
                  isSelected ? ' is-checked' : ''
                }`}
                draggable={editing !== item.name}
                onDragStart={(e) => onCardDragStart(e, item, index)}
                onDragEnd={onCardDragEnd}
                onDragOver={(e) => {
                  if (!canDnD || dragIndex == null) return;
                  e.preventDefault();
                  setDragOverIndex(index);
                }}
                onDrop={(e) => {
                  if (dragIndex == null) return;
                  e.preventDefault();
                  onReorder(dragIndex, index);
                  setDragIndex(null);
                  setDragOverIndex(null);
                }}
              >
                <label className='admin-media-check' onClick={(e) => e.stopPropagation()}>
                  <input
                    type='checkbox'
                    checked={isSelected}
                    onChange={() => toggleSelect(item.name)}
                    aria-label={`Виділити ${item.name}`}
                  />
                </label>
                {canDnD ? (
                  <div className='admin-drag-handle' title='Перетягніть для порядку' aria-hidden>
                    ⠿
                  </div>
                ) : null}
                {item.kind === 'video' ? (
                  <div className='admin-media-video-thumb' aria-hidden>
                    <span>▶</span>
                    <video src={item.url} muted preload='metadata' />
                  </div>
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={item.url}
                    alt={item.alt || item.name}
                    loading='lazy'
                    style={
                      item.focusX != null || item.focusY != null
                        ? {
                            objectPosition: `${item.focusX ?? 50}% ${item.focusY ?? 50}%`,
                          }
                        : undefined
                    }
                    title={
                      editing === item.name
                        ? 'Клік — задати focus point'
                        : item.focusX != null
                          ? `Focus ${item.focusX}% ${item.focusY}%`
                          : undefined
                    }
                    onClick={(e) => {
                      if (editing !== item.name) return;
                      const rect = e.currentTarget.getBoundingClientRect();
                      const x = Math.round(((e.clientX - rect.left) / rect.width) * 100);
                      const y = Math.round(((e.clientY - rect.top) / rect.height) * 100);
                      setEditFocusX(String(Math.min(100, Math.max(0, x))));
                      setEditFocusY(String(Math.min(100, Math.max(0, y))));
                      showToast(`Focus ${x}% ${y}% — натисніть OK`, 'info');
                    }}
                  />
                )}
                <div className='admin-media-meta'>
                  <span title={item.name}>{item.name}</span>
                  <span>
                    {item.kind === 'video' ? 'Відео · ' : ''}
                    {MEDIA_PURPOSES[item.purpose]?.label || item.purpose} ·{' '}
                    {formatBytes(item.size)}
                  </span>
                  {item.usedBy && item.usedBy.length > 0 ? (
                    <span
                      className='admin-media-usage'
                      title={item.usageTooltip || ''}
                    >
                      🔗 {item.usedBy.length}{' '}
                      {item.usedBy.length === 1 ? 'посилання' : 'посилань'}
                    </span>
                  ) : null}
                  {item.tags?.length ? (
                    <span className='admin-media-tags'>{item.tags.join(', ')}</span>
                  ) : null}
                </div>

                {editing === item.name ? (
                  <div className='admin-media-edit'>
                    <label className='admin-inline-label'>
                      Роль
                      <select
                        value={editPurpose}
                        onChange={(e) => setEditPurpose(e.target.value as MediaPurpose)}
                      >
                        {MEDIA_PURPOSE_IDS.map((id) => (
                          <option key={id} value={id}>
                            {MEDIA_PURPOSES[id].label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className='admin-inline-label'>
                      Папка
                      <select
                        value={editFolderId}
                        onChange={(e) => setEditFolderId(e.target.value)}
                      >
                        <option value=''>Без папки</option>
                        {folders.map((f) => (
                          <option key={f.id} value={f.id}>
                            {f.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className='admin-inline-label'>
                      Теги
                      <input value={editTags} onChange={(e) => setEditTags(e.target.value)} />
                    </label>
                    <label className='admin-inline-label'>
                      Alt
                      <input value={editAlt} onChange={(e) => setEditAlt(e.target.value)} />
                    </label>
                    <label className='admin-inline-label'>
                      Focus X%
                      <input
                        type='number'
                        min={0}
                        max={100}
                        value={editFocusX}
                        onChange={(e) => setEditFocusX(e.target.value)}
                      />
                    </label>
                    <label className='admin-inline-label'>
                      Focus Y%
                      <input
                        type='number'
                        min={0}
                        max={100}
                        value={editFocusY}
                        onChange={(e) => setEditFocusY(e.target.value)}
                      />
                    </label>
                    <div className='admin-row'>
                      <button
                        type='button'
                        className='admin-btn'
                        onClick={() => void saveEdit(item.name)}
                      >
                        OK
                      </button>
                      <button
                        type='button'
                        className='admin-btn admin-btn--secondary'
                        onClick={() => setEditing(null)}
                      >
                        Скасувати
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className='admin-media-card-actions'>
                    <div className='admin-row'>
                      <button
                        type='button'
                        className='admin-btn admin-btn--secondary'
                        onClick={() => void copyUrl(item.url)}
                      >
                        URL
                      </button>
                      <button
                        type='button'
                        className='admin-btn admin-btn--secondary'
                        title='Роль, папка, теги'
                        onClick={() => startEdit(item)}
                      >
                        Мета
                      </button>
                      <button
                        type='button'
                        className='admin-btn admin-btn--secondary'
                        title='Замінити файл, URL лишається'
                        onClick={() => {
                          setReplaceTarget(item.name);
                          replaceRef.current?.click();
                        }}
                      >
                        ↻
                      </button>
                      <button
                        type='button'
                        className='admin-btn admin-btn--danger'
                        disabled={Boolean(item.usedBy?.length)}
                        title={
                          item.usageTooltip ||
                          (item.usedBy?.length
                            ? 'Файл використовується на сайті'
                            : 'Видалити файл')
                        }
                        onClick={() => void remove(item.name, item.usageTooltip)}
                      >
                        Видалити
                      </button>
                    </div>
                    <span className='admin-hint admin-media-folder-hint'>
                      Папка змінюється тут
                    </span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
