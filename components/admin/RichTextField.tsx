'use client';

import { useCallback, useEffect, useRef } from 'react';

type Props = {
  label?: string;
  value: string;
  onChange: (html: string) => void;
  rows?: number;
  hint?: string;
};

/**
 * Lightweight rich-text helper: contentEditable + bold/italic/link toolbar.
 * Output is HTML (sanitized on public render via sanitizeHtml).
 * Only rewrites DOM when external value differs and editor is not focused.
 */
export function RichTextField({ label, value, onChange, rows = 4, hint }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const lastEmitted = useRef<string | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (document.activeElement === el) return;
    const next = value || '';
    if (el.innerHTML === next) {
      lastEmitted.current = next;
      return;
    }
    el.innerHTML = next;
    lastEmitted.current = next;
  }, [value]);

  const emit = useCallback(() => {
    if (!ref.current) return;
    const html = ref.current.innerHTML;
    lastEmitted.current = html;
    onChange(html);
  }, [onChange]);

  const apply = useCallback(
    (cmd: string, arg?: string) => {
      ref.current?.focus();
      try {
        document.execCommand(cmd, false, arg);
      } catch {
        /* ignore */
      }
      emit();
    },
    [emit],
  );

  return (
    <div className='admin-richtext'>
      {label ? <span className='admin-richtext__label'>{label}</span> : null}
      <div className='admin-richtext__toolbar' role='toolbar' aria-label='Форматування'>
        <button type='button' className='admin-btn admin-btn--secondary admin-btn--sm' onClick={() => apply('bold')}>
          <strong>B</strong>
        </button>
        <button type='button' className='admin-btn admin-btn--secondary admin-btn--sm' onClick={() => apply('italic')}>
          <em>I</em>
        </button>
        <button type='button' className='admin-btn admin-btn--secondary admin-btn--sm' onClick={() => apply('underline')}>
          <u>U</u>
        </button>
        <button
          type='button'
          className='admin-btn admin-btn--secondary admin-btn--sm'
          onClick={() => {
            const url = window.prompt('URL посилання');
            if (url) apply('createLink', url);
          }}
        >
          Link
        </button>
        <button
          type='button'
          className='admin-btn admin-btn--secondary admin-btn--sm'
          onClick={() => apply('removeFormat')}
        >
          Clear
        </button>
        <button
          type='button'
          className='admin-btn admin-btn--secondary admin-btn--sm'
          onClick={() => apply('insertUnorderedList')}
        >
          • List
        </button>
      </div>
      <div
        ref={ref}
        className='admin-richtext__editor'
        contentEditable
        role='textbox'
        aria-multiline
        suppressContentEditableWarning
        style={{ minHeight: `${Math.max(2, rows) * 1.4}em` }}
        onInput={emit}
        onBlur={emit}
      />
      {hint ? <span className='admin-hint'>{hint}</span> : null}
    </div>
  );
}
