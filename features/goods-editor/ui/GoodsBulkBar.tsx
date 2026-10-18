'use client';

import type { Product } from '@/lib/types';
import { normalizeCategoryInput } from '@/lib/shop-catalog';
import { showToast } from '@/components/admin/AdminToast';

export interface GoodsBulkBarProps {
  selectedIds: string[];
  selectAllFiltered: () => void;
  clearSelection: () => void;
  applyBulk: (mutator: (p: Product) => Product, msg: string) => void;
  bulkCategory: string;
  setBulkCategory: (cat: string) => void;
  bulkPct: string;
  setBulkPct: (pct: string) => void;
  deleteSelected: () => void;
}

export function GoodsBulkBar({
  selectedIds,
  selectAllFiltered,
  clearSelection,
  applyBulk,
  bulkCategory,
  setBulkCategory,
  bulkPct,
  setBulkPct,
  deleteSelected,
}: GoodsBulkBarProps) {
  if (selectedIds.length === 0) return null;

  return (
    <div className='admin-goods-toolbar__row admin-bulk-bar'>
      <span className='admin-hint' style={{ margin: 0 }}>
        Обрано: {selectedIds.length}
      </span>
      <button type='button' className='admin-btn admin-btn--secondary admin-btn--sm' onClick={selectAllFiltered}>
        Усі у фільтрі
      </button>
      <button type='button' className='admin-btn admin-btn--secondary admin-btn--sm' onClick={clearSelection}>
        Зняти
      </button>
      <button
        type='button'
        className='admin-btn admin-btn--secondary admin-btn--sm'
        onClick={() => applyBulk((p) => ({ ...p, visible: true }), 'Опубліковано')}
      >
        Опублікувати
      </button>
      <button
        type='button'
        className='admin-btn admin-btn--secondary admin-btn--sm'
        onClick={() => applyBulk((p) => ({ ...p, visible: false }), 'Приховано')}
      >
        Приховати
      </button>
      <input
        className='admin-field-sm'
        placeholder='Категорія bulk'
        value={bulkCategory}
        onChange={(e) => setBulkCategory(e.target.value)}
        list='goods-category-suggestions'
      />
      <button
        type='button'
        className='admin-btn admin-btn--secondary admin-btn--sm'
        onClick={() =>
          applyBulk(
            (p) => ({ ...p, category: normalizeCategoryInput(bulkCategory) }),
            'Категорію змінено',
          )
        }
      >
        Категорія
      </button>
      <input
        className='admin-field-sm'
        style={{ width: 72 }}
        placeholder='% ±'
        value={bulkPct}
        onChange={(e) => setBulkPct(e.target.value)}
        title='Напр. 10 або -5'
      />
      <button
        type='button'
        className='admin-btn admin-btn--secondary admin-btn--sm'
        onClick={() => {
          const pct = Number(bulkPct);
          if (!Number.isFinite(pct) || pct === 0) {
            showToast('Вкажіть відсоток', 'error');
            return;
          }
          applyBulk(
            (p) => ({
              ...p,
              price: Math.max(0, Math.round(p.price * (1 + pct / 100))),
            }),
            `Ціни ${pct > 0 ? '+' : ''}${pct}%`,
          );
        }}
      >
        Ціна %
      </button>
      <button
        type='button'
        className='admin-btn admin-btn--danger admin-btn--sm'
        onClick={deleteSelected}
      >
        Видалити
      </button>
    </div>
  );
}
