'use client';

import { useMemo, useState } from 'react';
import type { Product } from '@/lib/types';

type Props = {
  products: Product[];
  currentId: string;
  value: string[];
  onChange: (ids: string[]) => void;
};

/** Multi-select related products with search chips. */
export function RelatedProductsPicker({ products, currentId, value, onChange }: Props) {
  const [q, setQ] = useState('');
  const selected = useMemo(() => new Set(value), [value]);

  const candidates = useMemo(() => {
    const query = q.trim().toLowerCase();
    return products
      .filter((p) => p.id !== currentId)
      .filter((p) => {
        if (!query) return true;
        return (
          p.title.toLowerCase().includes(query) ||
          (p.code || '').toLowerCase().includes(query) ||
          (p.category || '').toLowerCase().includes(query) ||
          p.id.toLowerCase().includes(query)
        );
      })
      .slice(0, 40);
  }, [products, currentId, q]);

  function toggle(id: string) {
    if (selected.has(id)) {
      onChange(value.filter((x) => x !== id));
    } else {
      onChange([...value, id]);
    }
  }

  function move(id: string, dir: -1 | 1) {
    const i = value.indexOf(id);
    if (i < 0) return;
    const j = i + dir;
    if (j < 0 || j >= value.length) return;
    const next = [...value];
    const [item] = next.splice(i, 1);
    next.splice(j, 0, item);
    onChange(next);
  }

  const selectedProducts = value
    .map((id) => products.find((p) => p.id === id))
    .filter(Boolean) as Product[];

  return (
    <div className='admin-related-picker'>
      <span className='admin-hint'>
        Схожі товари (ручний порядок). Порожньо = авто за категорією на сайті.
      </span>
      {selectedProducts.length > 0 ? (
        <ul className='admin-related-selected'>
          {selectedProducts.map((p, idx) => (
            <li key={p.id} className='admin-related-selected__row'>
              <span>
                {idx + 1}. {p.title}
                {p.code ? ` · ${p.code}` : ''} · {p.price.toLocaleString('uk-UA')} ₴
              </span>
              <span className='admin-row' style={{ gap: 4 }}>
                <button
                  type='button'
                  className='admin-btn admin-btn--secondary admin-btn--sm'
                  disabled={idx === 0}
                  onClick={() => move(p.id, -1)}
                  aria-label='Вгору'
                >
                  ↑
                </button>
                <button
                  type='button'
                  className='admin-btn admin-btn--secondary admin-btn--sm'
                  disabled={idx === selectedProducts.length - 1}
                  onClick={() => move(p.id, 1)}
                  aria-label='Вниз'
                >
                  ↓
                </button>
                <button
                  type='button'
                  className='admin-btn admin-btn--danger admin-btn--sm'
                  onClick={() => toggle(p.id)}
                >
                  ×
                </button>
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className='admin-hint'>Нічого не вибрано — спрацює авто-підбір.</p>
      )}

      <input
        type='search'
        className='admin-field-sm admin-grow admin-mb'
        placeholder='Пошук товарів для звʼязку…'
        value={q}
        onChange={(e) => setQ(e.target.value)}
        aria-label='Пошук схожих'
      />
      <div className='admin-related-grid'>
        {candidates.map((p) => {
          const on = selected.has(p.id);
          return (
            <button
              key={p.id}
              type='button'
              className={`admin-related-chip${on ? ' is-on' : ''}`}
              onClick={() => toggle(p.id)}
              title={p.id}
            >
              <span className='admin-related-chip__title'>{p.title}</span>
              <span className='admin-related-chip__meta'>
                {p.price.toLocaleString('uk-UA')} ₴
                {p.category ? ` · ${p.category}` : ''}
                {on ? ' · ✓' : ''}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
