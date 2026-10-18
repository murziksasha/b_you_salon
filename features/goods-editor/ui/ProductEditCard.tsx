'use client';

import type React from 'react';
import type { Product } from '@/lib/types';
import { DEFAULT_CATEGORY } from '@/lib/shop-catalog';
import { ProductMediaEditor } from '@/components/admin/ProductMediaEditor';
import { RelatedProductsPicker } from '@/components/admin/RelatedProductsPicker';
import { PriceHistory } from '@/components/admin/PriceHistory';

export interface ProductEditCardProps {
  editing: Product;
  setEditing: (product: Product | null) => void;
  goods: Product[];
  categorySuggestions: string[];
  editFormRef: React.RefObject<HTMLDivElement | null>;
  titleInputRef: React.RefObject<HTMLInputElement | null>;
  saving: boolean;
  saveProduct: () => Promise<void>;
}

export function ProductEditCard({
  editing,
  setEditing,
  goods,
  categorySuggestions,
  editFormRef,
  titleInputRef,
  saving,
  saveProduct,
}: ProductEditCardProps) {
  const isExisting = goods.some(g => g.id === editing.id);

  return (
    <div
      ref={editFormRef}
      id='goods-edit-form'
      className='admin-card admin-form admin-form--editing admin-mb-lg'
      tabIndex={-1}
    >
      <h3>{isExisting ? 'Редагувати товар' : 'Новий товар'}</h3>
      <label>
        Назва
        <input
          ref={titleInputRef}
          value={editing.title}
          onChange={e => setEditing({ ...editing, title: e.target.value })}
        />
      </label>
      <label>
        Ціна
        <input
          type='number'
          min={0}
          step={1}
          value={Number.isFinite(editing.price) ? editing.price : 0}
          onChange={e => {
            const raw = e.target.value;
            if (raw === '') {
              setEditing({ ...editing, price: 0 });
              return;
            }
            const n = Number(raw);
            setEditing({ ...editing, price: Number.isFinite(n) ? Math.max(0, n) : 0 });
          }}
        />
      </label>
      <label>
        Код товару
        <input
          value={editing.code || ''}
          onChange={e => setEditing({ ...editing, code: e.target.value })}
          placeholder='Напр. SKU-12, АКБ/01…'
          autoComplete='off'
        />
        <span className='admin-hint'>
          Необов&apos;язково. Мін. 2 символи. Будь-які мови та знаки. Участь у пошуку в адмінці та магазині.
        </span>
      </label>
      <ProductMediaEditor
        product={editing}
        onChange={patch => setEditing({ ...editing, ...patch })}
        disabled={saving}
      />
      <label>
        Категорія (група на сайті)
        <input
          list='goods-category-suggestions'
          value={editing.category || ''}
          onChange={e => setEditing({ ...editing, category: e.target.value })}
          placeholder={`Напр. Телефони, ТВ… (порожньо = ${DEFAULT_CATEGORY})`}
        />
        <datalist id='goods-category-suggestions'>
          {categorySuggestions
            .filter(cat => cat !== DEFAULT_CATEGORY)
            .map(cat => (
              <option key={cat} value={cat} />
            ))}
          <option value={DEFAULT_CATEGORY} />
        </datalist>
        <span className='admin-hint'>
          Опційно. Порожнє поле = «{DEFAULT_CATEGORY}». Однакова назва об’єднує товари в групу в адмінці та на /shop.
        </span>
      </label>
      <label>
        Опис
        <textarea
          rows={3}
          value={editing.description}
          onChange={e => setEditing({ ...editing, description: e.target.value })}
        />
      </label>
      <label className='admin-check admin-goods-publish'>
        <input
          type='checkbox'
          checked={editing.visible}
          onChange={e => setEditing({ ...editing, visible: e.target.checked })}
        />
        <span>
          <strong>Опубліковано</strong>
          <span className='admin-hint' style={{ marginTop: 0 }}>
            {' '}
            — показувати у магазині /shop. Зняття прапорця не видаляє фото/відео.
          </span>
        </span>
      </label>
      <label className='admin-check'>
        <input
          type='checkbox'
          checked={editing.inStock !== false}
          onChange={e => setEditing({ ...editing, inStock: e.target.checked })}
        />
        В наявності
      </label>
      <label>
        Бейдж (hit / sale / new)
        <input
          value={editing.badge || ''}
          onChange={e => setEditing({ ...editing, badge: e.target.value })}
          placeholder='hit, sale…'
        />
      </label>
      <label>
        Промо-текст
        <input
          value={editing.promoText || ''}
          onChange={e => setEditing({ ...editing, promoText: e.target.value })}
          placeholder='Короткий рядок під назвою'
        />
      </label>
      <label className='admin-check'>
        <input
          type='checkbox'
          checked={Boolean(editing.sortPin)}
          onChange={e => setEditing({ ...editing, sortPin: e.target.checked })}
        />
        Закріпити на початку каталогу
      </label>
      <RelatedProductsPicker
        products={goods}
        currentId={editing.id}
        value={editing.relatedIds || []}
        onChange={ids => setEditing({ ...editing, relatedIds: ids.length ? ids : undefined })}
      />
      <PriceHistory productId={editing.id} />
      <div className='admin-row'>
        <button type='button' className='admin-btn' onClick={() => void saveProduct()} disabled={saving}>
          Зберегти товар
        </button>
        <button
          type='button'
          className='admin-btn admin-btn--secondary'
          onClick={() => {
            if (!confirm('Скасувати зміни товару?')) return;
            setEditing(null);
          }}
        >
          Скасувати
        </button>
        {(() => {
          const idx = goods.findIndex(g => g.id === editing.id);
          if (idx < 0) return null;
          return (
            <>
              <button
                type='button'
                className='admin-btn admin-btn--secondary'
                disabled={idx <= 0}
                onClick={() => setEditing(goods[idx - 1])}
              >
                ← Попередній
              </button>
              <button
                type='button'
                className='admin-btn admin-btn--secondary'
                disabled={idx >= goods.length - 1}
                onClick={() => setEditing(goods[idx + 1])}
              >
                Наступний →
              </button>
            </>
          );
        })()}
      </div>
    </div>
  );
}
