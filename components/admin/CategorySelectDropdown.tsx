'use client';

import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown, Plus, Search, X } from 'lucide-react';
import { DEFAULT_CATEGORY } from '@/lib/shop-catalog';

export type CategorySelectDropdownProps = {
  value: string;
  onChange: (val: string) => void;
  categories: string[];
  counts?: Record<string, number>;
  placeholder?: string;
  disabled?: boolean;
  id?: string;
};

export function CategorySelectDropdown({
  value,
  onChange,
  categories,
  counts,
  placeholder = `Напр. Декор, Догляд… (порожньо = ${DEFAULT_CATEGORY})`,
  disabled = false,
  id,
}: CategorySelectDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [coords, setCoords] = useState<{ top: number; left: number; width: number; placeAbove?: boolean } | null>(null);
  const [highlightIndex, setHighlightIndex] = useState(0);

  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const generatedId = useId();
  const selectId = id || generatedId;

  // Prepare list of categories: ensure DEFAULT_CATEGORY is at top, then unique sorted rest
  const normalizedCategories = useMemo(() => {
    const set = new Set<string>();
    for (const c of categories) {
      const trimmed = c.trim();
      if (trimmed && trimmed !== DEFAULT_CATEGORY) {
        set.add(trimmed);
      }
    }
    const rest = Array.from(set).sort((a, b) => a.localeCompare(b, 'uk'));
    return [DEFAULT_CATEGORY, ...rest];
  }, [categories]);

  // Filtered categories based on query
  const filteredCategories = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return normalizedCategories;
    return normalizedCategories.filter((c) => c.toLowerCase().includes(q));
  }, [normalizedCategories, query]);

  const canCreateNew = useMemo(() => {
    const q = query.trim();
    if (!q) return false;
    return !normalizedCategories.some((c) => c.toLowerCase() === q.toLowerCase());
  }, [normalizedCategories, query]);

  // Total selectable items count: filteredCategories + (canCreateNew ? 1 : 0)
  const totalOptions = filteredCategories.length + (canCreateNew ? 1 : 0);

  const updatePosition = useCallback(() => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    const menuHeight = 320;
    const placeAbove = spaceBelow < menuHeight && rect.top > menuHeight;

    setCoords({
      top: placeAbove ? Math.max(10, rect.top - 8) : rect.bottom + 6,
      left: Math.max(10, Math.min(rect.left, window.innerWidth - rect.width - 10)),
      width: Math.max(260, rect.width),
      placeAbove,
    });
  }, []);

  const openDropdown = useCallback(() => {
    if (disabled) return;
    setQuery('');
    setHighlightIndex(0);
    updatePosition();
    setIsOpen(true);
  }, [disabled, updatePosition]);

  const closeDropdown = useCallback(() => {
    setIsOpen(false);
    setQuery('');
    triggerRef.current?.focus();
  }, []);

  const handleSelect = useCallback(
    (selectedCat: string) => {
      onChange(selectedCat);
      closeDropdown();
    },
    [onChange, closeDropdown],
  );

  // Position listeners & focus management
  useEffect(() => {
    if (!isOpen) return;

    updatePosition();
    const handleScrollOrResize = () => updatePosition();
    window.addEventListener('resize', handleScrollOrResize);
    window.addEventListener('scroll', handleScrollOrResize, true);

    const timer = setTimeout(() => {
      searchInputRef.current?.focus();
    }, 50);

    return () => {
      window.removeEventListener('resize', handleScrollOrResize);
      window.removeEventListener('scroll', handleScrollOrResize, true);
      clearTimeout(timer);
    };
  }, [isOpen, updatePosition]);

  // Keyboard navigation
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        closeDropdown();
        return;
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setHighlightIndex((prev) => (prev + 1) % (totalOptions || 1));
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setHighlightIndex((prev) => (prev - 1 + (totalOptions || 1)) % (totalOptions || 1));
        return;
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        if (canCreateNew && highlightIndex === filteredCategories.length) {
          handleSelect(query.trim());
        } else if (filteredCategories[highlightIndex]) {
          handleSelect(filteredCategories[highlightIndex]);
        }
      }
    },
    [closeDropdown, totalOptions, canCreateNew, highlightIndex, filteredCategories, handleSelect, query],
  );

  const displayValue = value ? value.trim() : DEFAULT_CATEGORY;

  return (
    <div className='admin-category-select'>
      <button
        ref={triggerRef}
        type='button'
        id={selectId}
        className='admin-category-select__trigger'
        aria-haspopup='listbox'
        aria-expanded={isOpen}
        onClick={() => (isOpen ? closeDropdown() : openDropdown())}
        disabled={disabled}
      >
        <span className='admin-category-select__label'>
          {value ? (
            <span className='admin-category-select__current'>{value}</span>
          ) : (
            <span className='admin-category-select__placeholder'>{placeholder}</span>
          )}
        </span>
        <ChevronDown
          size={18}
          className={`admin-category-select__chevron${isOpen ? ' is-open' : ''}`}
          aria-hidden='true'
        />
      </button>

      {isOpen && typeof document !== 'undefined'
        ? createPortal(
            <div className='admin-category-portal admin-body'>
              {/* Blocking Background Backdrop */}
              <div
                className='admin-category-backdrop'
                role='presentation'
                onClick={closeDropdown}
                aria-hidden='true'
              />

              {/* Classical Dropdown Menu */}
              <div
                ref={menuRef}
                className={`admin-category-menu${coords?.placeAbove ? ' is-above' : ''}`}
                style={{
                  top: coords?.placeAbove ? undefined : coords?.top,
                  bottom: coords?.placeAbove ? `${window.innerHeight - (coords?.top ?? 0)}px` : undefined,
                  left: coords?.left,
                  width: coords?.width,
                }}
                role='dialog'
                aria-modal='true'
                aria-label='Вибір категорії'
                onKeyDown={handleKeyDown}
              >
                <div className='admin-category-menu__header'>
                  <div className='admin-category-menu__search-box'>
                    <Search size={16} className='admin-category-menu__search-icon' aria-hidden='true' />
                    <input
                      ref={searchInputRef}
                      type='text'
                      className='admin-category-menu__search-input'
                      placeholder='Пошук або нова категорія…'
                      value={query}
                      onChange={(e) => {
                        setQuery(e.target.value);
                        setHighlightIndex(0);
                      }}
                    />
                    {query ? (
                      <button
                        type='button'
                        className='admin-category-menu__clear-btn'
                        onClick={() => {
                          setQuery('');
                          searchInputRef.current?.focus();
                        }}
                        aria-label='Очистити пошук'
                      >
                        <X size={14} />
                      </button>
                    ) : null}
                  </div>
                </div>

                <ul className='admin-category-menu__list' role='listbox' tabIndex={-1}>
                  {filteredCategories.map((cat, idx) => {
                    const isSelected =
                      cat === DEFAULT_CATEGORY
                        ? !value || value.trim() === DEFAULT_CATEGORY
                        : value.trim() === cat;
                    const isHighlighted = idx === highlightIndex;
                    const count = counts ? counts[cat] : undefined;

                    return (
                      <li
                        key={cat}
                        role='option'
                        aria-selected={isSelected}
                        className={`admin-category-menu__item${isSelected ? ' is-selected' : ''}${
                          isHighlighted ? ' is-highlighted' : ''
                        }`}
                        onClick={() => handleSelect(cat)}
                        onMouseEnter={() => setHighlightIndex(idx)}
                      >
                        <div className='admin-category-menu__item-name'>
                          <span>{cat}</span>
                          {cat === DEFAULT_CATEGORY ? (
                            <span className='admin-category-menu__badge'>за замовчуванням</span>
                          ) : null}
                        </div>
                        <div className='admin-category-menu__item-meta'>
                          {typeof count === 'number' ? (
                            <span className='admin-category-menu__count'>{count} шт.</span>
                          ) : null}
                          {isSelected ? (
                            <Check size={16} className='admin-category-menu__check' aria-hidden='true' />
                          ) : null}
                        </div>
                      </li>
                    );
                  })}

                  {canCreateNew ? (
                    <li
                      role='option'
                      aria-selected={false}
                      className={`admin-category-menu__item admin-category-menu__item--create${
                        highlightIndex === filteredCategories.length ? ' is-highlighted' : ''
                      }`}
                      onClick={() => handleSelect(query.trim())}
                      onMouseEnter={() => setHighlightIndex(filteredCategories.length)}
                    >
                      <div className='admin-category-menu__item-name'>
                        <Plus size={16} className='admin-category-menu__create-icon' aria-hidden='true' />
                        <span>Створити: &laquo;<strong>{query.trim()}</strong>&raquo;</span>
                      </div>
                      <span className='admin-category-menu__badge admin-category-menu__badge--new'>Нова</span>
                    </li>
                  ) : null}

                  {!filteredCategories.length && !canCreateNew ? (
                    <li className='admin-category-menu__empty'>Категорій не знайдено</li>
                  ) : null}
                </ul>

                <div className='admin-category-menu__footer'>
                  <span className='admin-hint'>
                    Активна: <strong>{displayValue}</strong> · Esc щоб закрити
                  </span>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
