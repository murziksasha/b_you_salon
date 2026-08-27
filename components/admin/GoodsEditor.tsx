'use client';

import type { Product, SiteData } from '@/lib/types';
import { createId } from '@/lib/id';
import { patchSiteSection, saveSiteData } from '@/lib/admin/saveSite';
import { moveByDir, reorderItems } from '@/lib/admin/reorder';
import { useSaveShortcut, useUnsavedGuard } from '@/lib/admin/useUnsavedGuard';
import {
  DEFAULT_CATEGORY,
  PRODUCT_SORT_OPTIONS,
  UNCATEGORIZED_KEY,
  collectCategories,
  displayCategory,
  filterAndSortProducts,
  groupProductsByCategory,
  isDefaultCategory,
  normalizeCategoryInput,
  renameCategoryInGoods,
  type ProductSort,
  type VisibilityFilter,
} from '@/lib/shop-catalog';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  formatUsageTooltip,
  planProductMediaPurge,
  PRODUCT_PLACEHOLDER_IMAGE,
} from '@/lib/media-usage';
import { showToast } from './AdminToast';
import { ProductMediaEditor } from './ProductMediaEditor';
import { StickySaveBar } from './StickySaveBar';
import { PriceHistory } from './PriceHistory';
import { RelatedProductsPicker } from './RelatedProductsPicker';

type ListMode = 'grouped' | 'flat';

function emptyProduct(): Product {
  return {
    id: createId(),
    title: 'Новий товар',
    description: '',
    price: 0,
    image: PRODUCT_PLACEHOLDER_IMAGE,
    images: [],
    video: undefined,
    visible: true,
    category: '',
    code: '',
  };
}

function reorderReason(opts: {
  query: string;
  visibility: VisibilityFilter;
  categoryFilter: string;
  viewSort: ProductSort;
}): string | null {
  if (opts.query.trim()) return 'Очистіть пошук, щоб змінювати порядок каталогу';
  if (opts.visibility !== 'all') return 'Оберіть фільтр «Усі», щоб змінювати порядок';
  if (opts.categoryFilter.trim()) return 'Скиньте фільтр категорії, щоб змінювати порядок';
  if (opts.viewSort !== 'manual') return 'Оберіть сортування «За порядком каталогу»';
  return null;
}

export function GoodsEditor({ initialData }: { initialData: SiteData }) {
  const [data, setData] = useState(initialData);
  const [editing, setEditing] = useState<Product | null>(null);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [query, setQuery] = useState('');
  const [visibility, setVisibility] = useState<VisibilityFilter>('all');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [viewSort, setViewSort] = useState<ProductSort>('manual');
  const [listMode, setListMode] = useState<ListMode>('grouped');
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [dragId, setDragId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const [renamingKey, setRenamingKey] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [bulkCategory, setBulkCategory] = useState('');
  const [bulkPct, setBulkPct] = useState('');
  const orderToastAt = useRef(0);
  const editFormRef = useRef<HTMLDivElement>(null);
  const titleInputRef = useRef<HTMLInputElement>(null);
  const prevEditingId = useRef<string | null>(null);
  const csvInputRef = useRef<HTMLInputElement>(null);

  useUnsavedGuard(dirty || Boolean(editing));

  // Deep-link ?edit=productId
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const id = new URLSearchParams(window.location.search).get('edit');
    if (!id) return;
    const product = initialData.goods.find((g) => g.id === id);
    if (product) setEditing(product);
  }, [initialData.goods]);

  /** Scroll admin main to the product form and focus title when opening edit/create. */
  useEffect(() => {
    const id = editing?.id ?? null;
    if (!id || id === prevEditingId.current) {
      if (!id) prevEditingId.current = null;
      return;
    }
    prevEditingId.current = id;
    const form = editFormRef.current;
    if (!form) return;

    const run = () => {
      form.scrollIntoView({ behavior: 'smooth', block: 'start' });
      // Delay focus so smooth scroll isn't interrupted on some browsers
      window.setTimeout(() => {
        titleInputRef.current?.focus({ preventScroll: true });
      }, 280);
    };
    requestAnimationFrame(run);
  }, [editing?.id]);

  const save = useCallback(
    async (nextData?: SiteData) => {
      const payload = nextData ?? data;
      setSaving(true);
      const result = await patchSiteSection('goods', payload.goods, payload.updatedAt);
      setSaving(false);
      if (!result.ok) {
        if (!result.conflict) {
          const full = await saveSiteData(payload);
          if (full.ok) {
            setData({ ...payload, updatedAt: full.updatedAt || payload.updatedAt });
            setDirty(false);
            showToast('Збережено', 'success');
            return true;
          }
          showToast(full.error, 'error');
          return false;
        }
        showToast(result.error, 'error');
        return false;
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

  const counts = useMemo(() => {
    const all = data.goods.length;
    const visible = data.goods.filter((g) => g.visible).length;
    return { all, visible, hidden: all - visible };
  }, [data.goods]);

  /** Named + «Інше» when present — for select/chips/datalist. */
  const categorySuggestions = useMemo(() => collectCategories(data.goods), [data.goods]);

  const categoryChipStats = useMemo(() => {
    return categorySuggestions.map((cat) => {
      const items =
        cat === DEFAULT_CATEGORY
          ? data.goods.filter((g) => isDefaultCategory(g))
          : data.goods.filter((g) => (g.category || '').trim() === cat);
      return {
        cat,
        total: items.length,
        visible: items.filter((g) => g.visible).length,
      };
    });
  }, [data.goods, categorySuggestions]);

  const filtersActive = useMemo(() => {
    return (
      Boolean(query.trim()) ||
      visibility !== 'all' ||
      Boolean(categoryFilter.trim()) ||
      viewSort !== 'manual'
    );
  }, [query, visibility, categoryFilter, viewSort]);

  function resetFilters() {
    setQuery('');
    setVisibility('all');
    setCategoryFilter('');
    setViewSort('manual');
  }

  const filtered = useMemo(() => {
    const list = filterAndSortProducts(data.goods, {
      query,
      sort: viewSort,
      visibility,
      category: categoryFilter || undefined,
    });
    return list.map((g) => ({
      product: g,
      index: data.goods.findIndex((item) => item.id === g.id),
    }));
  }, [data.goods, query, viewSort, visibility, categoryFilter]);

  const groups = useMemo(() => {
    const products = filtered.map((f) => f.product);
    return groupProductsByCategory(products);
  }, [filtered]);

  const blockReason = reorderReason({ query, visibility, categoryFilter, viewSort });
  const canReorder = !blockReason;

  function markOrderDirty() {
    setDirty(true);
    const now = Date.now();
    if (now - orderToastAt.current > 4000) {
      orderToastAt.current = now;
      showToast('Порядок змінено — натисніть «Зберегти всі»', 'success');
    }
  }

  const selectedIds = useMemo(
    () => Object.entries(selected).filter(([, v]) => v).map(([id]) => id),
    [selected],
  );

  function toggleSelect(id: string) {
    setSelected((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  function selectAllFiltered() {
    const next: Record<string, boolean> = { ...selected };
    for (const { product } of filtered) next[product.id] = true;
    setSelected(next);
  }

  function clearSelection() {
    setSelected({});
  }

  function applyBulk(mutator: (p: Product) => Product, msg: string) {
    if (!selectedIds.length) {
      showToast('Оберіть товари', 'info');
      return;
    }
    const set = new Set(selectedIds);
    setData({
      ...data,
      goods: data.goods.map((g) => (set.has(g.id) ? mutator(g) : g)),
    });
    setDirty(true);
    showToast(msg, 'success');
  }

  function exportCsv() {
    const rows = [
      ['id', 'code', 'title', 'price', 'category', 'visible', 'inStock', 'badge', 'promoText', 'description'],
      ...data.goods.map((g) => [
        g.id,
        g.code || '',
        g.title,
        String(g.price),
        g.category || '',
        g.visible ? '1' : '0',
        g.inStock === false ? '0' : '1',
        g.badge || '',
        g.promoText || '',
        (g.description || '').replace(/\r?\n/g, ' '),
      ]),
    ];
    const csv = rows
      .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(','))
      .join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'goods.csv';
    a.click();
    URL.revokeObjectURL(url);
    showToast('CSV експортовано', 'success');
  }

  async function importCsv(file: File) {
    const text = await file.text();
    const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/).filter(Boolean);
    if (lines.length < 2) {
      showToast('Порожній CSV', 'error');
      return;
    }
    function parseLine(line: string): string[] {
      const out: string[] = [];
      let cur = '';
      let inQ = false;
      for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (ch === '"') {
          if (inQ && line[i + 1] === '"') {
            cur += '"';
            i++;
          } else inQ = !inQ;
        } else if (ch === ',' && !inQ) {
          out.push(cur);
          cur = '';
        } else cur += ch;
      }
      out.push(cur);
      return out;
    }
    const header = parseLine(lines[0]).map((h) => h.trim().toLowerCase());
    const idx = (name: string) => header.indexOf(name);
    const iCode = idx('code');
    const iTitle = idx('title');
    const iPrice = idx('price');
    const iCat = idx('category');
    const iVis = idx('visible');
    const iId = idx('id');
    const iStock = idx('instock');
    const iBadge = idx('badge');
    const iPromo = idx('promotext');
    const iDesc = idx('description');
    if (iTitle < 0 || iPrice < 0) {
      showToast('CSV: потрібні колонки title, price', 'error');
      return;
    }

    let created = 0;
    let updated = 0;
    const goods = [...data.goods];
    for (const line of lines.slice(1)) {
      const cols = parseLine(line);
      const title = (cols[iTitle] || '').trim();
      if (!title) continue;
      const price = Number(cols[iPrice] || 0) || 0;
      const code = iCode >= 0 ? (cols[iCode] || '').trim() : '';
      const id = iId >= 0 ? (cols[iId] || '').trim() : '';
      let found = id ? goods.findIndex((g) => g.id === id) : -1;
      if (found < 0 && code) found = goods.findIndex((g) => (g.code || '') === code);
      const patch: Partial<Product> = {
        title,
        price,
        code: code.length >= 2 ? code : undefined,
        category: iCat >= 0 ? normalizeCategoryInput(cols[iCat]) : undefined,
        visible: iVis >= 0 ? cols[iVis] === '1' || cols[iVis].toLowerCase() === 'true' : true,
        inStock: iStock >= 0 ? !(cols[iStock] === '0' || cols[iStock].toLowerCase() === 'false') : true,
        badge: iBadge >= 0 ? cols[iBadge] || undefined : undefined,
        promoText: iPromo >= 0 ? cols[iPromo] || undefined : undefined,
        description: iDesc >= 0 ? cols[iDesc] || '' : undefined,
      };
      if (found >= 0) {
        goods[found] = { ...goods[found], ...patch, updatedAt: new Date().toISOString() };
        updated++;
      } else {
        goods.push({
          ...emptyProduct(),
          ...patch,
          title,
          price,
          description: patch.description || '',
          image: PRODUCT_PLACEHOLDER_IMAGE,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
        created++;
      }
    }
    setData({ ...data, goods });
    setDirty(true);
    showToast(`Імпорт: +${created} нових, ${updated} оновлено. Збережіть.`, 'success');
  }

  async function saveProduct() {
    if (!editing) return;
    const codeTrimmed = (editing.code || '').trim();
    if (codeTrimmed.length === 1) {
      showToast('Код товару: мінімум 2 символи (або залиште порожнім)', 'error');
      return;
    }
    const prev = data.goods.find((g) => g.id === editing.id);
    if (prev && prev.price > 0 && editing.price > 0) {
      const delta = Math.abs(editing.price - prev.price) / prev.price;
      if (delta >= 0.2) {
        if (
          !confirm(
            `Ціна змінюється на ${Math.round(delta * 100)}% (${prev.price} → ${editing.price}). Підтвердити?`,
          )
        ) {
          return;
        }
      }
    }
    if (editing.visible) {
      const { productPublishIssues } = await import('@/lib/catalog-health');
      const issues = productPublishIssues(editing);
      if (issues.length) {
        if (
          !confirm(
            `Чекліст опублікованого товару:\n· ${issues.join('\n· ')}\n\nВсе одно зберегти як опублікований?`,
          )
        ) {
          return;
        }
      }
    }
    const goods = [...data.goods];
    const idx = goods.findIndex((g) => g.id === editing.id);
    const stamped: Product = {
      ...editing,
      category: normalizeCategoryInput(editing.category),
      code: codeTrimmed.length >= 2 ? codeTrimmed : undefined,
      updatedAt: new Date().toISOString(),
      createdAt: editing.createdAt || new Date().toISOString(),
    };
    if (idx >= 0) goods[idx] = stamped;
    else goods.push(stamped);
    const nextData = { ...data, goods };
    const ok = await save(nextData);
    if (!ok) return;
    setEditing(null);
  }

  async function deleteProduct(id: string) {
    const product = data.goods.find((g) => g.id === id);
    if (!product) return;

    const nextGoods = data.goods.filter((g) => g.id !== id);
    const nextData: SiteData = { ...data, goods: nextGoods };
    const plan = planProductMediaPurge(product, nextData);

    const lines = [
      `Видалити товар «${product.title}»?`,
      '',
      plan.deletable.length
        ? `Файли з бібліотеки, які буде видалено: ${plan.deletable.length}`
        : 'Окремих файлів у /uploads для видалення немає.',
      plan.retained.length
        ? `Залишаться (використовуються деінде): ${plan.retained.length}\n${plan.retained
            .slice(0, 4)
            .map((r) => `· ${r.name}: ${formatUsageTooltip(r.refs)}`)
            .join('\n')}`
        : '',
      '',
      'Приховування (зняти «Опубліковано») файли НЕ видаляє.',
    ].filter(Boolean);

    if (!confirm(lines.join('\n'))) return;

    const ok = await save(nextData);
    if (!ok) return;
    if (editing?.id === id) setEditing(null);

    if (plan.deletable.length === 0) {
      showToast('Товар видалено', 'success');
      return;
    }

    try {
      const res = await fetch('/api/media/purge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ names: plan.deletable }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        deleted?: string[];
        skipped?: Array<{ name: string; reason?: string }>;
        failed?: string[];
        error?: string;
      };
      if (!res.ok) {
        showToast(
          json.error ||
            'Товар видалено, але файли медіа не вдалося прибрати — перевірте Медіатеку',
          'error',
        );
        return;
      }
      const deleted = json.deleted?.length || 0;
      const skipped = json.skipped?.length || 0;
      const failed = json.failed?.length || 0;
      if (skipped || failed) {
        showToast(
          `Товар видалено. Медіа: видалено ${deleted}, залишено ${skipped}${failed ? `, помилок ${failed}` : ''}`,
          skipped || failed ? 'info' : 'success',
        );
      } else {
        showToast(
          deleted ? `Товар і ${deleted} файл(ів) медіа видалено` : 'Товар видалено',
          'success',
        );
      }
    } catch {
      showToast('Товар видалено, мережева помилка при очищенні медіа', 'error');
    }
  }

  function toggleVisible(id: string) {
    setData({
      ...data,
      goods: data.goods.map((g) => (g.id === id ? { ...g, visible: !g.visible } : g)),
    });
    setDirty(true);
  }

  function duplicateProduct(product: Product) {
    const copy: Product = {
      ...product,
      id: createId(),
      title: `${product.title} (копія)`,
      visible: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    setData({ ...data, goods: [...data.goods, copy] });
    setDirty(true);
    setEditing(copy);
  }

  function reorderById(fromId: string, toId: string) {
    if (fromId === toId) return;
    const from = data.goods.findIndex((g) => g.id === fromId);
    const to = data.goods.findIndex((g) => g.id === toId);
    if (from < 0 || to < 0) return;
    setData({ ...data, goods: reorderItems(data.goods, from, to) });
    markOrderDirty();
  }

  function moveProduct(id: string, dir: -1 | 1) {
    const index = data.goods.findIndex((g) => g.id === id);
    if (index < 0) return;
    const next = moveByDir(data.goods, index, dir);
    if (next === data.goods) return;
    setData({ ...data, goods: next });
    markOrderDirty();
  }

  function commitRename(fromKey: string) {
    // Default «Інше» bucket is fixed — assign a real name by editing products or
    // only rename named groups.
    if (fromKey === UNCATEGORIZED_KEY) {
      setRenamingKey(null);
      return;
    }
    const nextName = renameValue.trim();
    if (!nextName || nextName === fromKey) {
      setRenamingKey(null);
      return;
    }
    setData({ ...data, goods: renameCategoryInGoods(data.goods, fromKey, nextName) });
    setDirty(true);
    setRenamingKey(null);
    if (categoryFilter === fromKey) {
      setCategoryFilter(normalizeCategoryInput(nextName) ?? DEFAULT_CATEGORY);
    }
    showToast(
      `Категорію перейменовано: ${normalizeCategoryInput(nextName) ?? DEFAULT_CATEGORY}`,
      'success',
    );
  }

  function renderProductRow(product: Product, index: number) {
    const isHidden = !product.visible;
    const isDragging = dragId === product.id;
    const isDrop = dragOverId === product.id && dragId !== product.id;

    return (
      <div
        key={product.id}
        className={`admin-goods-row admin-section-item${isHidden ? ' is-hidden-section' : ''}${
          isDragging ? ' is-dragging' : ''
        }${isDrop ? ' is-drop-target' : ''}`}
        onDragOver={(e) => {
          if (!canReorder || !dragId) return;
          e.preventDefault();
          e.dataTransfer.dropEffect = 'move';
          setDragOverId(product.id);
        }}
        onDrop={(e) => {
          e.preventDefault();
          const fromId = e.dataTransfer.getData('text/plain') || dragId;
          if (fromId) reorderById(fromId, product.id);
          setDragId(null);
          setDragOverId(null);
        }}
      >
        <span
          className={`admin-drag-handle${canReorder ? '' : ' is-disabled'}`}
          title={canReorder ? 'Перетягнути' : blockReason || 'Порядок недоступний'}
          role='button'
          tabIndex={canReorder ? 0 : -1}
          aria-label={canReorder ? 'Перемістити товар' : blockReason || 'Порядок недоступний'}
          aria-disabled={!canReorder}
          draggable={canReorder}
          onDragStart={(e) => {
            if (!canReorder) {
              e.preventDefault();
              return;
            }
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/plain', product.id);
            setDragId(product.id);
          }}
          onDragEnd={() => {
            setDragId(null);
            setDragOverId(null);
          }}
          onKeyDown={(e) => {
            if (!canReorder) return;
            if (e.key === 'ArrowUp') {
              e.preventDefault();
              moveProduct(product.id, -1);
            }
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              moveProduct(product.id, 1);
            }
          }}
        >
          ⠿
        </span>

        <div className='admin-goods-row__thumb' aria-hidden>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={product.image || '/img/services/technika_img.png'} alt='' />
        </div>

        <label className='admin-goods-row__check' title='Вибрати'>
          <input
            type='checkbox'
            checked={Boolean(selected[product.id])}
            onChange={() => toggleSelect(product.id)}
            aria-label={`Вибрати ${product.title}`}
          />
        </label>

        <div className='admin-goods-row__meta'>
          <div className='admin-goods-row__title'>
            {product.title}
            {product.badge ? <span className='admin-goods-pill admin-goods-pill--badge'>{product.badge}</span> : null}
            {product.inStock === false ? (
              <span className='admin-goods-pill admin-goods-pill--muted'>немає</span>
            ) : null}
          </div>
          <div className='admin-goods-row__sub'>
            <span className='admin-goods-row__price'>{product.price} ₴</span>
            {product.code ? <span className='admin-goods-row__code'>{product.code}</span> : null}
            <span
              className={`admin-goods-pill${isDefaultCategory(product) ? ' admin-goods-pill--muted' : ''}`}
            >
              {displayCategory(product)}
            </span>
          </div>
        </div>

        <div className='admin-goods-row__status'>
          <span className={`admin-status-badge ${isHidden ? 'admin-status-badge--off' : 'admin-status-badge--on'}`}>
            {isHidden ? 'Приховано' : 'Опубліковано'}
          </span>
        </div>

        <div className='admin-goods-row__actions'>
          <button
            type='button'
            className='admin-btn admin-btn--secondary admin-btn--sm'
            title={isHidden ? 'Опублікувати' : 'Приховати'}
            aria-label={isHidden ? 'Опублікувати товар' : 'Приховати товар'}
            onClick={() => toggleVisible(product.id)}
          >
            {isHidden ? '👁' : '👁‍🗨'}
          </button>
          <button
            type='button'
            className='admin-btn admin-btn--secondary admin-btn--sm'
            title='Редагувати'
            aria-label='Редагувати'
            onClick={() => setEditing(product)}
          >
            ✎
          </button>
          <button
            type='button'
            className='admin-btn admin-btn--secondary admin-btn--sm'
            title='Дублікат'
            aria-label='Дублікувати товар'
            onClick={() => duplicateProduct(product)}
          >
            ⧉
          </button>
          <button
            type='button'
            className='admin-btn admin-btn--danger admin-btn--sm'
            title='Видалити'
            aria-label='Видалити'
            onClick={() => void deleteProduct(product.id)}
          >
            ×
          </button>
        </div>

        {/* index kept for potential keyboard context; not shown */}
        <span className='admin-sr-only'>{index + 1}</span>
      </div>
    );
  }

  return (
    <div className='admin-goods'>
      <div className='admin-goods-toolbar'>
        <div className='admin-goods-toolbar__row'>
          <button type='button' className='admin-btn' disabled={saving} onClick={() => void save()}>
            {saving ? 'Збереження…' : 'Зберегти всі'}
          </button>
          <a href='/shop' target='_blank' rel='noreferrer' className='admin-btn admin-btn--secondary'>
            Відкрити магазин ↗
          </a>
          <button type='button' className='admin-btn admin-btn--secondary' onClick={() => setEditing(emptyProduct())}>
            + Товар
          </button>
          <button type='button' className='admin-btn admin-btn--secondary' onClick={exportCsv}>
            CSV ↓
          </button>
          <button
            type='button'
            className='admin-btn admin-btn--secondary'
            onClick={() => csvInputRef.current?.click()}
          >
            CSV ↑
          </button>
          <input
            ref={csvInputRef}
            type='file'
            accept='.csv,text/csv'
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void importCsv(f);
              e.target.value = '';
            }}
          />
          {dirty ? <span className='admin-dirty'>Є незбережені зміни · Ctrl+S</span> : null}
        </div>

        {selectedIds.length > 0 ? (
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
              onClick={() => {
                if (!confirm(`Видалити ${selectedIds.length} товар(ів)? (медіа не чиститься bulk)`)) return;
                const set = new Set(selectedIds);
                setData({ ...data, goods: data.goods.filter((g) => !set.has(g.id)) });
                setDirty(true);
                clearSelection();
                showToast('Видалено зі списку — збережіть', 'success');
              }}
            >
              Видалити
            </button>
          </div>
        ) : null}

        <div className='admin-goods-toolbar__row admin-goods-toolbar__filters'>
          <input
            className='admin-field-sm admin-goods-search'
            type='search'
            placeholder='Пошук: назва, код, категорія…'
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label='Пошук товарів'
          />
          <select
            className='admin-select admin-field-sm'
            value={visibility}
            onChange={(e) => setVisibility(e.target.value as VisibilityFilter)}
            aria-label='Фільтр видимості'
          >
            <option value='all'>Усі ({counts.all})</option>
            <option value='visible'>Опубліковані ({counts.visible})</option>
            <option value='hidden'>Приховані ({counts.hidden})</option>
          </select>
          <select
            className='admin-select admin-field-sm'
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            aria-label='Фільтр категорії'
          >
            <option value=''>Усі категорії</option>
            {categorySuggestions.map((cat) => (
              <option key={cat} value={cat}>
                {cat}
              </option>
            ))}
          </select>
          <select
            className='admin-select admin-field-sm'
            value={viewSort}
            onChange={(e) => setViewSort(e.target.value as ProductSort)}
            aria-label='Сортування списку'
          >
            {PRODUCT_SORT_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          <button
            type='button'
            className='admin-btn admin-btn--secondary admin-btn--sm'
            onClick={resetFilters}
            disabled={!filtersActive}
            title={filtersActive ? 'Скинути пошук, фільтри та сортування' : 'Фільтри вже за замовчуванням'}
            aria-label='Скинути фільтри'
          >
            Скинути фільтри
          </button>
          <div className='admin-goods-mode' role='group' aria-label='Режим списку'>
            <button
              type='button'
              className={`admin-btn admin-btn--secondary admin-btn--sm${listMode === 'grouped' ? ' is-active' : ''}`}
              onClick={() => setListMode('grouped')}
            >
              Групи
            </button>
            <button
              type='button'
              className={`admin-btn admin-btn--secondary admin-btn--sm${listMode === 'flat' ? ' is-active' : ''}`}
              onClick={() => setListMode('flat')}
            >
              Плоский
            </button>
          </div>
        </div>

        {categoryChipStats.length ? (
          <div className='admin-goods-chips' role='group' aria-label='Швидкий фільтр категорій'>
            <button
              type='button'
              className={`admin-chip${categoryFilter === '' ? ' is-active' : ''}`}
              onClick={() => setCategoryFilter('')}
            >
              Усі ({counts.all})
            </button>
            {categoryChipStats.map(({ cat, total, visible }) => {
              const filterValue = cat === DEFAULT_CATEGORY ? DEFAULT_CATEGORY : cat;
              const isActive =
                categoryFilter === filterValue ||
                (cat === DEFAULT_CATEGORY && categoryFilter === UNCATEGORIZED_KEY);
              return (
                <button
                  key={cat}
                  type='button'
                  className={`admin-chip${isActive ? ' is-active' : ''}`}
                  onClick={() => setCategoryFilter(isActive ? '' : filterValue)}
                >
                  {cat} ({visible}/{total})
                </button>
              );
            })}
          </div>
        ) : null}
      </div>

      {blockReason ? (
        <p className='admin-hint admin-goods-reorder-hint admin-mb' role='status'>
          Порядок каталогу (⠿ / ↑↓): <strong>заблоковано</strong> — {blockReason}. Сортування списку вище —
          лише для перегляду.
        </p>
      ) : (
        <p className='admin-hint admin-mb'>
          Перетягуйте ⠿ або стрілки ↑↓ на handle, щоб задати порядок на сайті. Після зміни натисніть «Зберегти
          всі». Групи = категорії вітрини.
        </p>
      )}

      {editing ? (
        <div
          ref={editFormRef}
          id='goods-edit-form'
          className='admin-card admin-form admin-form--editing admin-mb-lg'
          tabIndex={-1}
        >
          <h3>{data.goods.some((g) => g.id === editing.id) ? 'Редагувати товар' : 'Новий товар'}</h3>
          <label>
            Назва
            <input
              ref={titleInputRef}
              value={editing.title}
              onChange={(e) => setEditing({ ...editing, title: e.target.value })}
            />
          </label>
          <label>
            Ціна
            <input
              type='number'
              min={0}
              step={1}
              value={Number.isFinite(editing.price) ? editing.price : 0}
              onChange={(e) => {
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
              onChange={(e) => setEditing({ ...editing, code: e.target.value })}
              placeholder='Напр. SKU-12, АКБ/01…'
              autoComplete='off'
            />
            <span className='admin-hint'>
              Необов&apos;язково. Мін. 2 символи. Будь-які мови та знаки. Участь у пошуку в адмінці та магазині.
            </span>
          </label>
          <ProductMediaEditor
            product={editing}
            onChange={(patch) => setEditing({ ...editing, ...patch })}
            disabled={saving}
          />
          <label>
            Категорія (група на сайті)
            <input
              list='goods-category-suggestions'
              value={editing.category || ''}
              onChange={(e) => setEditing({ ...editing, category: e.target.value })}
              placeholder={`Напр. Телефони, ТВ… (порожньо = ${DEFAULT_CATEGORY})`}
            />
            <datalist id='goods-category-suggestions'>
              {categorySuggestions
                .filter((cat) => cat !== DEFAULT_CATEGORY)
                .map((cat) => (
                  <option key={cat} value={cat} />
                ))}
              <option value={DEFAULT_CATEGORY} />
            </datalist>
            <span className='admin-hint'>
              Опційно. Порожнє поле = «{DEFAULT_CATEGORY}». Однакова назва об’єднує товари в групу в
              адмінці та на /shop.
            </span>
          </label>
          <label>
            Опис
            <textarea
              rows={3}
              value={editing.description}
              onChange={(e) => setEditing({ ...editing, description: e.target.value })}
            />
          </label>
          <label className='admin-check admin-goods-publish'>
            <input
              type='checkbox'
              checked={editing.visible}
              onChange={(e) => setEditing({ ...editing, visible: e.target.checked })}
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
              onChange={(e) => setEditing({ ...editing, inStock: e.target.checked })}
            />
            В наявності
          </label>
          <label>
            Бейдж (hit / sale / new)
            <input
              value={editing.badge || ''}
              onChange={(e) => setEditing({ ...editing, badge: e.target.value })}
              placeholder='hit, sale…'
            />
          </label>
          <label>
            Промо-текст
            <input
              value={editing.promoText || ''}
              onChange={(e) => setEditing({ ...editing, promoText: e.target.value })}
              placeholder='Короткий рядок під назвою'
            />
          </label>
          <label className='admin-check'>
            <input
              type='checkbox'
              checked={Boolean(editing.sortPin)}
              onChange={(e) => setEditing({ ...editing, sortPin: e.target.checked })}
            />
            Закріпити на початку каталогу
          </label>
          <RelatedProductsPicker
            products={data.goods}
            currentId={editing.id}
            value={editing.relatedIds || []}
            onChange={(ids) =>
              setEditing({ ...editing, relatedIds: ids.length ? ids : undefined })
            }
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
              const idx = data.goods.findIndex((g) => g.id === editing.id);
              if (idx < 0) return null;
              return (
                <>
                  <button
                    type='button'
                    className='admin-btn admin-btn--secondary'
                    disabled={idx <= 0}
                    onClick={() => setEditing(data.goods[idx - 1])}
                  >
                    ← Попередній
                  </button>
                  <button
                    type='button'
                    className='admin-btn admin-btn--secondary'
                    disabled={idx >= data.goods.length - 1}
                    onClick={() => setEditing(data.goods[idx + 1])}
                  >
                    Наступний →
                  </button>
                </>
              );
            })()}
          </div>
        </div>
      ) : null}

      <StickySaveBar dirty={dirty && !editing} saving={saving} onSave={() => void save()} label='Зберегти всі' />

      <div className='admin-card admin-goods-list'>
        {!data.goods.length ? <p>Товарів ще немає. Натисніть «+ Товар».</p> : null}
        {data.goods.length && !filtered.length ? <p className='admin-hint'>Нічого не знайдено</p> : null}

        {listMode === 'flat'
          ? filtered.map(({ product, index }) => renderProductRow(product, index))
          : groups.map((group) => {
              const isCollapsed = Boolean(collapsed[group.key]);
              return (
                <section key={group.key} className='admin-goods-group'>
                  <header className='admin-goods-group__head'>
                    <button
                      type='button'
                      className='admin-goods-group__toggle'
                      aria-expanded={!isCollapsed}
                      onClick={() => setCollapsed((c) => ({ ...c, [group.key]: !c[group.key] }))}
                    >
                      <span aria-hidden>{isCollapsed ? '▸' : '▾'}</span>
                      {renamingKey === group.key ? (
                        <input
                          className='admin-goods-group__rename'
                          value={renameValue}
                          autoFocus
                          onClick={(e) => e.stopPropagation()}
                          onChange={(e) => setRenameValue(e.target.value)}
                          onKeyDown={(e) => {
                            e.stopPropagation();
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              commitRename(group.key);
                            }
                            if (e.key === 'Escape') {
                              e.preventDefault();
                              setRenamingKey(null);
                            }
                          }}
                          onBlur={() => commitRename(group.key)}
                          aria-label='Нова назва категорії'
                        />
                      ) : (
                        <span className='admin-goods-group__title'>{group.label}</span>
                      )}
                      <span className='admin-goods-group__count'>
                        {group.visibleCount}/{group.total} опубл.
                      </span>
                    </button>
                    {group.key !== UNCATEGORIZED_KEY && renamingKey !== group.key ? (
                      <button
                        type='button'
                        className='admin-btn admin-btn--secondary admin-btn--sm'
                        onClick={() => {
                          setRenamingKey(group.key);
                          setRenameValue(group.label);
                        }}
                      >
                        Перейменувати
                      </button>
                    ) : null}
                    <button
                      type='button'
                      className='admin-btn admin-btn--secondary admin-btn--sm'
                      onClick={() => {
                        const filterValue =
                          group.key === UNCATEGORIZED_KEY ? DEFAULT_CATEGORY : group.key;
                        const active =
                          categoryFilter === filterValue ||
                          (group.key === UNCATEGORIZED_KEY &&
                            categoryFilter === UNCATEGORIZED_KEY);
                        setCategoryFilter(active ? '' : filterValue);
                      }}
                    >
                      Фільтр
                    </button>
                  </header>
                  {!isCollapsed ? (
                    <div className='admin-goods-group__body'>
                      {group.products.map((product) => {
                        const index = data.goods.findIndex((g) => g.id === product.id);
                        return renderProductRow(product, index);
                      })}
                    </div>
                  ) : null}
                </section>
              );
            })}
      </div>
    </div>
  );
}
