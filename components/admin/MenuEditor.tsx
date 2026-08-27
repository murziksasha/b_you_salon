'use client';

import type { MenuItem, ServiceNavItem, SiteData } from '@/lib/types';
import { saveSiteData } from '@/lib/admin/saveSite';
import { moveByDir, reorderItems } from '@/lib/admin/reorder';
import { useSaveShortcut, useUnsavedGuard } from '@/lib/admin/useUnsavedGuard';
import { createId } from '@/lib/id';
import { useCallback, useState } from 'react';
import { showToast } from './AdminToast';
import { StickySaveBar } from './StickySaveBar';
import { resolveSaveConflict } from '@/lib/admin/handleSaveResult';

function emptyMenuItem(): MenuItem {
  return { id: createId(), label: 'Новий пункт', href: '/', visible: true };
}

function emptyServiceItem(): ServiceNavItem {
  return { id: createId(), label: 'Нова послуга', slug: 'new', href: '/new', visible: true };
}

export function MenuEditor({ initialData }: { initialData: SiteData }) {
  const [data, setData] = useState(initialData);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [drag, setDrag] = useState<{ list: 'header' | 'services'; index: number } | null>(null);
  const [over, setOver] = useState<{ list: 'header' | 'services'; index: number } | null>(null);

  useUnsavedGuard(dirty);

  const save = useCallback(async () => {
    setSaving(true);
    let result = await saveSiteData(data);
    if (!result.ok && result.conflict) {
      const forced = await resolveSaveConflict(data, result);
      if (forced) result = forced;
      else {
        setSaving(false);
        return;
      }
    }
    setSaving(false);
    if (result.ok) {
      if (result.updatedAt) setData((prev) => ({ ...prev, updatedAt: result.updatedAt }));
      setDirty(false);
      showToast('Збережено', 'success');
    } else {
      showToast(result.error, 'error');
    }
  }, [data]);

  useSaveShortcut(save, { dirty, enabled: !saving });

  function mark(next: SiteData) {
    setData(next);
    setDirty(true);
  }

  function updateHeader(index: number, patch: Partial<MenuItem>) {
    const headerMenu = [...data.headerMenu];
    headerMenu[index] = { ...headerMenu[index], ...patch };
    mark({ ...data, headerMenu });
  }

  function updateService(index: number, patch: Partial<ServiceNavItem>) {
    const servicesNav = [...data.servicesNav];
    servicesNav[index] = { ...servicesNav[index], ...patch };
    mark({ ...data, servicesNav });
  }

  function onDrop(list: 'header' | 'services', to: number) {
    if (!drag || drag.list !== list) {
      setDrag(null);
      setOver(null);
      return;
    }
    if (list === 'header') {
      mark({ ...data, headerMenu: reorderItems(data.headerMenu, drag.index, to) });
    } else {
      mark({ ...data, servicesNav: reorderItems(data.servicesNav, drag.index, to) });
    }
    setDrag(null);
    setOver(null);
  }

  function renderDragHandle(list: 'header' | 'services', index: number, max: number) {
    return (
      <span
        className='admin-drag-handle'
        title='Перетягнути'
        role='button'
        tabIndex={0}
        aria-label='Перемістити пункт'
        onKeyDown={(e) => {
          if (e.key === 'ArrowUp' && index > 0) {
            e.preventDefault();
            if (list === 'header') mark({ ...data, headerMenu: moveByDir(data.headerMenu, index, -1) });
            else mark({ ...data, servicesNav: moveByDir(data.servicesNav, index, -1) });
          }
          if (e.key === 'ArrowDown' && index < max - 1) {
            e.preventDefault();
            if (list === 'header') mark({ ...data, headerMenu: moveByDir(data.headerMenu, index, 1) });
            else mark({ ...data, servicesNav: moveByDir(data.servicesNav, index, 1) });
          }
        }}
      >
        ⠿
      </span>
    );
  }

  return (
    <div>
      <div className='admin-toolbar'>
        <button type='button' className='admin-btn' onClick={() => void save()} disabled={saving}>
          {saving ? 'Збереження…' : 'Зберегти'}
        </button>
        {dirty ? <span className='admin-dirty'>Є незбережені зміни · Ctrl+S</span> : null}
      </div>
      <p className='admin-hint admin-mb-lg'>Перетягуйте пункти за ⠿. Ctrl+S — зберегти.</p>

      <div className='admin-card'>
        <div className='admin-row admin-row--between admin-mb'>
          <h3>Шапка сайту</h3>
          <button
            type='button'
            className='admin-btn admin-btn--secondary'
            onClick={() => mark({ ...data, headerMenu: [...data.headerMenu, emptyMenuItem()] })}
          >
            + Пункт
          </button>
        </div>
        {data.headerMenu.map((item, i) => (
          <div
            key={item.id}
            className={`admin-section-item admin-form${
              drag?.list === 'header' && drag.index === i ? ' is-dragging' : ''
            }${over?.list === 'header' && over.index === i && drag?.index !== i ? ' is-drop-target' : ''}`}
            draggable
            onDragStart={(e) => {
              if (!(e.target as HTMLElement).closest('.admin-drag-handle')) {
                e.preventDefault();
                return;
              }
              setDrag({ list: 'header', index: i });
              e.dataTransfer.effectAllowed = 'move';
              e.dataTransfer.setData('text/plain', String(i));
            }}
            onDragEnd={() => {
              setDrag(null);
              setOver(null);
            }}
            onDragOver={(e) => {
              e.preventDefault();
              setOver({ list: 'header', index: i });
            }}
            onDrop={(e) => {
              e.preventDefault();
              onDrop('header', i);
            }}
          >
            <div className='admin-row admin-row--between admin-mb'>
              <div className='admin-row'>
                {renderDragHandle('header', i, data.headerMenu.length)}
                <strong>
                  {i + 1}. {item.label || 'Без назви'}
                </strong>
              </div>
              <button
                type='button'
                className='admin-btn admin-btn--danger'
                onClick={() => {
                  if (!confirm('Видалити пункт меню?')) return;
                  mark({ ...data, headerMenu: data.headerMenu.filter((_, ii) => ii !== i) });
                }}
              >
                ×
              </button>
            </div>
            <label>
              Назва
              <input value={item.label} onChange={(e) => updateHeader(i, { label: e.target.value })} />
            </label>
            <label>
              Посилання
              <input value={item.href} onChange={(e) => updateHeader(i, { href: e.target.value })} />
            </label>
            <label className='admin-check'>
              <input
                type='checkbox'
                checked={item.visible}
                onChange={(e) => updateHeader(i, { visible: e.target.checked })}
              />
              Видимий
            </label>
          </div>
        ))}
        {!data.headerMenu.length ? <p className='admin-hint'>Немає пунктів — додайте.</p> : null}
      </div>

      <div className='admin-card'>
        <div className='admin-row admin-row--between admin-mb'>
          <h3>Навігація послуг</h3>
          <button
            type='button'
            className='admin-btn admin-btn--secondary'
            onClick={() => mark({ ...data, servicesNav: [...data.servicesNav, emptyServiceItem()] })}
          >
            + Послуга
          </button>
        </div>
        {data.servicesNav.map((item, i) => (
          <div
            key={item.id}
            className={`admin-section-item admin-form${
              drag?.list === 'services' && drag.index === i ? ' is-dragging' : ''
            }${over?.list === 'services' && over.index === i && drag?.index !== i ? ' is-drop-target' : ''}`}
            draggable
            onDragStart={(e) => {
              if (!(e.target as HTMLElement).closest('.admin-drag-handle')) {
                e.preventDefault();
                return;
              }
              setDrag({ list: 'services', index: i });
              e.dataTransfer.effectAllowed = 'move';
            }}
            onDragEnd={() => {
              setDrag(null);
              setOver(null);
            }}
            onDragOver={(e) => {
              e.preventDefault();
              setOver({ list: 'services', index: i });
            }}
            onDrop={(e) => {
              e.preventDefault();
              onDrop('services', i);
            }}
          >
            <div className='admin-row admin-row--between admin-mb'>
              <div className='admin-row'>
                {renderDragHandle('services', i, data.servicesNav.length)}
                <strong>
                  {i + 1}. {item.label || 'Без назви'}
                </strong>
              </div>
              <button
                type='button'
                className='admin-btn admin-btn--danger'
                onClick={() => {
                  if (!confirm('Видалити пункт послуг?')) return;
                  mark({ ...data, servicesNav: data.servicesNav.filter((_, ii) => ii !== i) });
                }}
              >
                ×
              </button>
            </div>
            <label>
              Назва
              <input value={item.label} onChange={(e) => updateService(i, { label: e.target.value })} />
            </label>
            <label>
              slug
              <input
                value={item.slug}
                onChange={(e) => {
                  const slug = e.target.value;
                  updateService(i, { slug, href: `/${slug}` });
                }}
              />
            </label>
            <label>
              Посилання
              <input value={item.href} onChange={(e) => updateService(i, { href: e.target.value })} />
            </label>
            <label className='admin-check'>
              <input
                type='checkbox'
                checked={item.visible}
                onChange={(e) => updateService(i, { visible: e.target.checked })}
              />
              Видимий
            </label>
          </div>
        ))}
        {!data.servicesNav.length ? <p className='admin-hint'>Немає послуг — додайте.</p> : null}
      </div>

      <StickySaveBar dirty={dirty} saving={saving} onSave={() => void save()} />
    </div>
  );
}
