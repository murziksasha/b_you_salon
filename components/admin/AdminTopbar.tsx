'use client';

import Link from 'next/link';
import { ExternalLink, Keyboard, Menu, Rows3, Rows4, Search, X } from 'lucide-react';
import { useAdminCounts } from './AdminCountsContext';

type AdminTopbarProps = {
  mobileOpen: boolean;
  onToggleMobile: () => void;
  compact: boolean;
  onToggleDensity: () => void;
};

export function AdminTopbar({
  mobileOpen,
  onToggleMobile,
  compact,
  onToggleDensity,
}: AdminTopbarProps) {
  const counts = useAdminCounts();
  const inbox = counts.openTotal;

  function openPalette() {
    window.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true }),
    );
  }

  function openShortcuts() {
    window.dispatchEvent(new KeyboardEvent('keydown', { key: '?', bubbles: true }));
  }

  return (
    <header className='admin-topbar'>
      <button
        type='button'
        className='admin-topbar-btn admin-topbar-hamburger'
        aria-label={mobileOpen ? 'Закрити навігацію' : 'Відкрити навігацію'}
        aria-expanded={mobileOpen}
        onClick={onToggleMobile}
      >
        {mobileOpen ? <X size={20} strokeWidth={2} aria-hidden /> : <Menu size={20} strokeWidth={2} aria-hidden />}
      </button>

      <button type='button' className='admin-topbar-search' onClick={openPalette}>
        <Search size={18} strokeWidth={2} aria-hidden />
        <span className='admin-topbar-search-label'>Пошук розділів, телефону, товарів</span>
        <kbd>Ctrl+K</kbd>
      </button>

      <div className='admin-topbar-actions'>
        {inbox > 0 ? (
          <Link href='/admin/inbox' className='admin-topbar-inbox' title='Відкриті в Inbox'>
            Inbox
            <span className={`admin-nav-badge${counts.live ? ' is-live' : ''}`}>
              {inbox > 99 ? '99+' : inbox}
            </span>
          </Link>
        ) : null}

        <button
          type='button'
          className={`admin-topbar-btn${compact ? ' is-on' : ''}`}
          title={compact ? 'Звичайна щільність' : 'Компактний режим'}
          aria-pressed={compact}
          onClick={onToggleDensity}
        >
          {compact ? (
            <Rows3 size={18} strokeWidth={2} aria-hidden />
          ) : (
            <Rows4 size={18} strokeWidth={2} aria-hidden />
          )}
          <span className='admin-topbar-btn-label'>{compact ? 'Компакт' : 'Комфорт'}</span>
        </button>

        <button type='button' className='admin-topbar-btn' title='Гарячі клавіші' onClick={openShortcuts}>
          <Keyboard size={18} strokeWidth={2} aria-hidden />
          <span className='admin-topbar-btn-label'>Клавіші</span>
        </button>

        <a href='/' target='_blank' rel='noreferrer' className='admin-topbar-btn' title='Відкрити сайт'>
          <ExternalLink size={18} strokeWidth={2} aria-hidden />
          <span className='admin-topbar-btn-label'>Сайт</span>
        </a>
      </div>
    </header>
  );
}
