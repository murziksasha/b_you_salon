'use client';

import type { TimeFilter } from '@/lib/journal-filter';

type Props = {
  title: string;
  openCount?: number;
  filter: 'all' | 'open' | 'done';
  onFilter: (v: 'all' | 'open' | 'done') => void;
  timeFilter: TimeFilter;
  onTimeFilter: (v: TimeFilter) => void;
  phoneQ: string;
  onPhoneQ: (v: string) => void;
  csvHref: string;
  onRefresh: () => void;
  extra?: React.ReactNode;
};

/** Shared filter bar for Leads / Orders journals. */
export function JournalToolbar({
  title,
  openCount,
  filter,
  onFilter,
  timeFilter,
  onTimeFilter,
  phoneQ,
  onPhoneQ,
  csvHref,
  onRefresh,
  extra,
}: Props) {
  return (
    <div className='admin-row admin-row--between admin-mb'>
      <h2 className='admin-h2' style={{ margin: 0 }}>
        {title}{' '}
        {openCount != null && openCount > 0 ? (
          <span className='admin-badge'>{openCount} відкритих</span>
        ) : null}
      </h2>
      <div className='admin-row admin-row--wrap'>
        {extra}
        <select
          className='admin-select'
          value={filter}
          onChange={(e) => onFilter(e.target.value as typeof filter)}
          aria-label='Статус'
        >
          <option value='open'>Відкриті</option>
          <option value='done'>Закриті</option>
          <option value='all'>Усі</option>
        </select>
        <select
          className='admin-select'
          value={timeFilter}
          onChange={(e) => onTimeFilter(e.target.value as TimeFilter)}
          aria-label='Період'
        >
          <option value='all'>Весь час</option>
          <option value='today'>Сьогодні</option>
          <option value='week'>7 днів</option>
        </select>
        <input
          type='search'
          className='admin-field-sm'
          placeholder='Телефон…'
          value={phoneQ}
          onChange={(e) => onPhoneQ(e.target.value)}
          aria-label='Пошук за телефоном'
        />
        <a className='admin-btn admin-btn--secondary' href={csvHref}>
          CSV
        </a>
        <button type='button' className='admin-btn admin-btn--secondary' onClick={onRefresh}>
          Оновити
        </button>
      </div>
    </div>
  );
}
