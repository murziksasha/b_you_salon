'use client';

import type { SalonService, SiteData } from '@/lib/types';
import { createId } from '@/lib/id';
import { patchSiteSection, saveSiteData } from '@/lib/admin/saveSite';
import { moveByDir } from '@/lib/admin/reorder';
import { useSaveShortcut, useUnsavedGuard } from '@/lib/admin/useUnsavedGuard';
import { uniqueServiceSlug } from '@/lib/services-catalog';
import { useCallback, useState } from 'react';
import { showToast } from './AdminToast';
import { ImageField } from './ImageField';
import { StickySaveBar } from './StickySaveBar';

function emptyService(): SalonService {
  return {
    id: createId(),
    title: 'Нова послуга',
    slug: 'new-service',
    category: 'Нігті',
    description: '',
    priceFrom: 0,
    image: '/img/hero/interior.jpg',
    visible: true,
  };
}

export function ServicesEditor({ initialData }: { initialData: SiteData }) {
  const [data, setData] = useState(initialData);
  const [editing, setEditing] = useState<SalonService | null>(null);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  useUnsavedGuard(dirty || Boolean(editing));

  const list = data.services || [];

  const save = useCallback(
    async (nextData?: SiteData) => {
      const payload = nextData ?? data;
      setSaving(true);
      const result = await patchSiteSection('services', payload.services || [], payload.updatedAt);
      setSaving(false);
      if (!result.ok) {
        const full = await saveSiteData(payload);
        if (!full.ok) {
          showToast(full.error, 'error');
          return false;
        }
        setData({ ...payload, updatedAt: full.updatedAt || payload.updatedAt });
        setDirty(false);
        showToast('Збережено', 'success');
        return true;
      }
      setData({ ...payload, updatedAt: result.updatedAt || payload.updatedAt });
      setDirty(false);
      showToast('Збережено', 'success');
      return true;
    },
    [data],
  );

  useSaveShortcut(
    () => {
      if (editing) return;
      void save();
    },
    { dirty, enabled: !saving && !editing },
  );

  function commitList(services: SalonService[]) {
    setData({ ...data, services });
    setDirty(true);
  }

  function saveEditing() {
    if (!editing) return;
    const slug = uniqueServiceSlug(list, editing.slug || editing.title, editing.id);
    const nextItem = { ...editing, slug };
    const idx = list.findIndex((s) => s.id === nextItem.id);
    const services = idx >= 0 ? list.map((s) => (s.id === nextItem.id ? nextItem : s)) : [...list, nextItem];
    const next = { ...data, services };
    setEditing(null);
    void save(next);
  }

  return (
    <div>
      <div className='admin-row admin-mb'>
        <button type='button' className='admin-btn' onClick={() => setEditing(emptyService())}>
          + Послуга
        </button>
      </div>
      <div className='admin-list'>
        {list.map((svc, index) => (
          <div key={svc.id} className='admin-nested-card'>
            <div className='admin-row admin-row--between'>
              <strong>{svc.title}</strong>
              <span className='admin-hint'>
                /salon/{svc.slug} · {svc.visible ? 'видима' : 'схована'}
              </span>
            </div>
            <div className='admin-row'>
              <button type='button' className='admin-btn admin-btn--secondary' onClick={() => setEditing(svc)}>
                Редагувати
              </button>
              <button
                type='button'
                className='admin-btn admin-btn--secondary'
                onClick={() => commitList(moveByDir(list, index, -1))}
              >
                ↑
              </button>
              <button
                type='button'
                className='admin-btn admin-btn--secondary'
                onClick={() => commitList(moveByDir(list, index, 1))}
              >
                ↓
              </button>
              <button
                type='button'
                className='admin-btn admin-btn--danger'
                onClick={() => commitList(list.filter((s) => s.id !== svc.id))}
              >
                Видалити
              </button>
            </div>
          </div>
        ))}
      </div>

      {editing ? (
        <div className='admin-nested-card' style={{ marginTop: '1rem' }}>
          <h2>Редагування</h2>
          <label>
            Назва
            <input value={editing.title} onChange={(e) => setEditing({ ...editing, title: e.target.value })} />
          </label>
          <label>
            Slug
            <input value={editing.slug} onChange={(e) => setEditing({ ...editing, slug: e.target.value })} />
          </label>
          <label>
            Категорія
            <input
              value={editing.category}
              onChange={(e) => setEditing({ ...editing, category: e.target.value })}
            />
          </label>
          <label>
            Опис
            <textarea
              rows={3}
              value={editing.description}
              onChange={(e) => setEditing({ ...editing, description: e.target.value })}
            />
          </label>
          <label>
            Ціна від
            <input
              type='number'
              value={editing.priceFrom}
              onChange={(e) => setEditing({ ...editing, priceFrom: Number(e.target.value) || 0 })}
            />
          </label>
          <label>
            Примітка до ціни
            <input
              value={editing.priceNote || ''}
              onChange={(e) => setEditing({ ...editing, priceNote: e.target.value })}
            />
          </label>
          <label>
            Тривалість, хв
            <input
              type='number'
              value={editing.durationMin || ''}
              onChange={(e) => setEditing({ ...editing, durationMin: Number(e.target.value) || undefined })}
            />
          </label>
          <label className='admin-row'>
            <input
              type='checkbox'
              checked={editing.visible}
              onChange={(e) => setEditing({ ...editing, visible: e.target.checked })}
            />
            Видима
          </label>
          <ImageField
            value={editing.image}
            onChange={(url) => setEditing({ ...editing, image: url })}
            preset='default'
          />
          <div className='admin-row'>
            <button type='button' className='admin-btn' onClick={saveEditing}>
              Зберегти послугу
            </button>
            <button type='button' className='admin-btn admin-btn--secondary' onClick={() => setEditing(null)}>
              Скасувати
            </button>
          </div>
        </div>
      ) : null}

      <StickySaveBar dirty={dirty} saving={saving} onSave={() => void save()} />
    </div>
  );
}
