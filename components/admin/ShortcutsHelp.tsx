'use client';

import { useEffect, useState } from 'react';

const ROWS: Array<{ keys: string; desc: string }> = [
  { keys: 'Ctrl+K', desc: 'Командна палітра (пошук розділів, товарів, телефону)' },
  { keys: 'Ctrl+S', desc: 'Зберегти поточний редактор' },
  { keys: 'Ctrl+Z / Y', desc: 'Undo / Redo у конструкторі сторінок' },
  { keys: '?', desc: 'Ця довідка' },
  { keys: 'Esc', desc: 'Закрити палітру / мобільне меню' },
  { keys: 'j / k', desc: 'Inbox: наступний / попередній запис' },
  { keys: 'c', desc: 'Inbox: подзвонити' },
  { keys: 'd', desc: 'Inbox: статус «Готово»' },
  { keys: '/', desc: 'Inbox: фокус у пошук телефону' },
];

export function ShortcutsHelp() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (e.target as HTMLElement)?.isContentEditable) {
        if (e.key !== 'Escape') return;
      }
      if (e.key === '?' && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        setOpen((v) => !v);
      }
      if (e.key === 'Escape' && open) {
        e.preventDefault();
        setOpen(false);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  if (!open) return null;

  return (
    <div className='admin-cmd-overlay' role='dialog' aria-modal='true' aria-label='Гарячі клавіші'>
      <button type='button' className='admin-cmd-backdrop' aria-label='Закрити' onClick={() => setOpen(false)} />
      <div className='admin-cmd-panel admin-shortcuts-panel'>
        <div className='admin-cmd-input-row'>
          <strong>Гарячі клавіші</strong>
          <kbd className='admin-cmd-kbd'>Esc</kbd>
        </div>
        <table className='admin-shortcuts-table'>
          <tbody>
            {ROWS.map((r) => (
              <tr key={r.keys}>
                <td>
                  <kbd>{r.keys}</kbd>
                </td>
                <td>{r.desc}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className='admin-cmd-footer'>Натисніть <kbd>?</kbd> ще раз, щоб закрити</p>
      </div>
    </div>
  );
}
