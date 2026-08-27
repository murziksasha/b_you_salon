'use client';

import { useEffect, useRef, useState } from 'react';

function getScrollEl(): Element {
  return document.scrollingElement ?? document.documentElement;
}

export function PageUp() {
  const [visible, setVisible] = useState(false);
  const scrollingProgrammatically = useRef(false);
  const safetyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const onScroll = () => {
      // Avoid re-hiding mid smooth-scroll (display/focus thrash can cancel it).
      if (scrollingProgrammatically.current) return;
      setVisible(window.scrollY > 400);
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      if (safetyTimer.current) clearTimeout(safetyTimer.current);
    };
  }, []);

  function ensureAtTop() {
    scrollingProgrammatically.current = false;
    const el = getScrollEl();
    if (window.scrollY > 0 || el.scrollTop > 0) {
      el.scrollTo({ top: 0, left: 0, behavior: 'auto' });
      window.scrollTo(0, 0);
    }
    setVisible(window.scrollY > 400);
  }

  function scrollTop() {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const el = getScrollEl();

    // Blur so hiding/focus changes cannot cancel the in-flight smooth scroll.
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }

    if (reduced) {
      el.scrollTo({ top: 0, left: 0, behavior: 'auto' });
      window.scrollTo(0, 0);
      setVisible(false);
      return;
    }

    scrollingProgrammatically.current = true;
    if (safetyTimer.current) clearTimeout(safetyTimer.current);

    el.scrollTo({ top: 0, left: 0, behavior: 'smooth' });

    const onScrollEnd = () => {
      el.removeEventListener('scrollend', onScrollEnd);
      if (safetyTimer.current) {
        clearTimeout(safetyTimer.current);
        safetyTimer.current = null;
      }
      ensureAtTop();
    };
    el.addEventListener('scrollend', onScrollEnd, { once: true });

    // Fallback when scrollend is unsupported or scroll was interrupted.
    safetyTimer.current = setTimeout(() => {
      el.removeEventListener('scrollend', onScrollEnd);
      ensureAtTop();
      safetyTimer.current = null;
    }, 900);
  }

  return (
    <button
      type='button'
      className={`pageup${visible ? '' : ' pageup--hidden'}`}
      onClick={scrollTop}
      aria-label='Вгору'
      aria-hidden={!visible}
      tabIndex={visible ? 0 : -1}
    >
      <svg className='up' viewBox='0 0 26 26' fill='currentColor' xmlns='http://www.w3.org/2000/svg' aria-hidden>
        <path
          fillRule='evenodd'
          clipRule='evenodd'
          d='M26 0H0V26H26V0ZM4.6593 17.7519L13.1233 10.33L21.5873 17.7519L22.9059 16.2481L13.7826 8.24813L13.1233 7.67L12.464 8.24813L3.3407 16.2481L4.6593 17.7519Z'
          fill='currentColor'
        />
      </svg>
    </button>
  );
}
