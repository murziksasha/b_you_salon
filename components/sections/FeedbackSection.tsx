'use client';

import Image from 'next/image';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { FeedbackSection as FeedbackSectionType } from '@/lib/types';

export function FeedbackSection({
  section,
  reviewsUrl,
}: {
  section: FeedbackSectionType;
  reviewsUrl?: string;
}) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const touchStartX = useRef<number | null>(null);
  const quotes = section.quotes || [];
  const images = (section.images || []).filter(Boolean);
  const count = images.length;

  const go = useCallback(
    (dir: -1 | 1) => {
      if (!count) return;
      setIndex((i) => (i + dir + count) % count);
    },
    [count],
  );

  useEffect(() => {
    if (count < 2 || paused) return;
    const timer = setInterval(() => setIndex((i) => (i + 1) % count), 6000);
    return () => clearInterval(timer);
  }, [count, paused]);

  if (quotes.length && !images.length) {
    return (
      <section className='by-section' id='feedback'>
        <div className='by-wrap'>
          <h2 className='by-section__title'>Відгуки</h2>
          <div className='by-quotes'>
            {quotes.map((q) => (
              <blockquote className='by-quote' key={q.name + q.text.slice(0, 12)}>
                <p>{q.text}</p>
                <footer>
                  {q.name}
                  {q.service ? ` · ${q.service}` : ''}
                </footer>
              </blockquote>
            ))}
          </div>
          {reviewsUrl ? (
            <p className='by-quotes__more'>
              <a className='by-btn by-btn--ghost' href={reviewsUrl} target='_blank' rel='noopener noreferrer'>
                {section.moreReviewsButtonText || 'Більше відгуків'}
              </a>
            </p>
          ) : null}
        </div>
      </section>
    );
  }

  if (!count) return null;

  return (
    <div className='feedback' id='feedback'>
      <div
        className='feedback__wrapper wrapper'
        onMouseEnter={() => setPaused(true)}
        onMouseLeave={() => setPaused(false)}
        onFocusCapture={() => setPaused(true)}
        onBlurCapture={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setPaused(false);
        }}
      >
        <h2 className='by-section__title feedback__title'>Відгуки</h2>
        <div
          className='feedback__viewport'
          role='region'
          aria-roledescription='carousel'
          aria-label='Відгуки клієнтів'
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'ArrowLeft') {
              e.preventDefault();
              go(-1);
            }
            if (e.key === 'ArrowRight') {
              e.preventDefault();
              go(1);
            }
          }}
          onTouchStart={(e) => {
            touchStartX.current = e.changedTouches[0]?.clientX ?? null;
          }}
          onTouchEnd={(e) => {
            const start = touchStartX.current;
            touchStartX.current = null;
            if (start == null) return;
            const end = e.changedTouches[0]?.clientX ?? start;
            const delta = end - start;
            if (Math.abs(delta) < 40) return;
            go(delta > 0 ? -1 : 1);
          }}
        >
          {count > 1 ? (
            <>
              <button
                className='feedback left-arrow'
                type='button'
                aria-label='Попередній відгук'
                onClick={() => go(-1)}
              >
                <Image src='/img/icons/left-arr.png' alt='' width={24} height={24} />
              </button>
              <button
                className='feedback right-arrow'
                type='button'
                aria-label='Наступний відгук'
                onClick={() => go(1)}
              >
                <Image src='/img/icons/right-arr.png' alt='' width={24} height={24} />
              </button>
            </>
          ) : null}

          {images.map((src, i) => (
            <div
              key={src + i}
              className={`feedback__slider-item${i === index ? ' is-active' : ''}`}
              aria-hidden={i !== index}
            >
              <Image
                src={src}
                alt={`Відгук ${i + 1} з ${count}`}
                width={800}
                height={600}
                sizes='(max-width: 80rem) 100vw, 80rem'
                priority={i === 0 || i === 2}
              />
            </div>
          ))}
        </div>

        {count > 1 ? (
          <div className='feedback__dots' role='group' aria-label='Слайди відгуків'>
            {images.map((_, i) => (
              <button
                key={i}
                type='button'
                aria-current={i === index ? 'true' : undefined}
                aria-label={`Слайд ${i + 1} з ${count}`}
                className={`feedback__dot${i === index ? ' is-active' : ''}`}
                onClick={() => setIndex(i)}
              />
            ))}
          </div>
        ) : null}

        <p className='feedback__status' aria-live='polite'>
          {index + 1} / {count}
        </p>

        {reviewsUrl ? (
          <a
            className='_callback__btn _btn feedback-btn'
            id='feed-google'
            href={reviewsUrl}
            target='_blank'
            rel='noopener noreferrer'
          >
            {section.moreReviewsButtonText}
          </a>
        ) : null}
      </div>
    </div>
  );
}
