'use client';

import { useCallback, useEffect, useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';

type AdminScrollNavProps = {
  containerRef?: React.RefObject<HTMLElement | null>;
};

export function AdminScrollNav({ containerRef }: AdminScrollNavProps) {
  const [scrollable, setScrollable] = useState(false);
  const [canScrollUp, setCanScrollUp] = useState(false);
  const [canScrollDown, setCanScrollDown] = useState(false);

  const getContainer = useCallback((): HTMLElement | null => {
    if (containerRef && containerRef.current) {
      return containerRef.current;
    }
    return document.querySelector<HTMLElement>('.admin-main');
  }, [containerRef]);

  const updateScrollState = useCallback(() => {
    const el = getContainer();
    if (!el) {
      setScrollable(false);
      return;
    }

    const { scrollTop, scrollHeight, clientHeight } = el;
    const isScrollable = scrollHeight - clientHeight > 48;
    setScrollable(isScrollable);

    if (!isScrollable) {
      setCanScrollUp(false);
      setCanScrollDown(false);
      return;
    }

    // Threshold of 16px to tolerate subpixel rounding
    setCanScrollUp(scrollTop > 16);
    setCanScrollDown(scrollTop + clientHeight < scrollHeight - 16);
  }, [getContainer]);

  useEffect(() => {
    const el = getContainer();
    if (!el) return;

    updateScrollState();

    const onScroll = () => {
      updateScrollState();
    };

    el.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', updateScrollState, { passive: true });

    let resizeObserver: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(() => {
        updateScrollState();
      });
      resizeObserver.observe(el);
    }

    return () => {
      el.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', updateScrollState);
      if (resizeObserver) {
        resizeObserver.disconnect();
      }
    };
  }, [getContainer, updateScrollState]);

  const scrollToTop = useCallback(() => {
    const el = getContainer();
    if (!el) return;
    const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    el.scrollTo({
      top: 0,
      left: 0,
      behavior: prefersReduced ? 'auto' : 'smooth',
    });
  }, [getContainer]);

  const scrollToBottom = useCallback(() => {
    const el = getContainer();
    if (!el) return;
    const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    el.scrollTo({
      top: el.scrollHeight,
      left: 0,
      behavior: prefersReduced ? 'auto' : 'smooth',
    });
  }, [getContainer]);

  return (
    <div
      className={`admin-scroll-nav${scrollable ? ' is-visible' : ''}`}
      role='region'
      aria-label='Швидка навігація сторінкою'
      aria-hidden={!scrollable}
    >
      <button
        type='button'
        className={`admin-scroll-btn admin-scroll-btn--up${!canScrollUp ? ' is-dimmed' : ''}`}
        onClick={scrollToTop}
        disabled={!canScrollUp}
        aria-label='Прокрутити на початок'
        title='Вгору (Home)'
        tabIndex={scrollable ? 0 : -1}
      >
        <ChevronUp size={20} strokeWidth={2.4} aria-hidden />
      </button>

      <span className='admin-scroll-divider' aria-hidden />

      <button
        type='button'
        className={`admin-scroll-btn admin-scroll-btn--down${!canScrollDown ? ' is-dimmed' : ''}`}
        onClick={scrollToBottom}
        disabled={!canScrollDown}
        aria-label='Прокрутити в кінець'
        title='Вниз (End)'
        tabIndex={scrollable ? 0 : -1}
      >
        <ChevronDown size={20} strokeWidth={2.4} aria-hidden />
      </button>
    </div>
  );
}
