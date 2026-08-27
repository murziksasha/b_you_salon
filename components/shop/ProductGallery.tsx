'use client';

import { useState } from 'react';
import { PublicImage } from '@/components/ui/PublicImage';

type ProductGalleryProps = {
  images: string[];
  alt: string;
};

/** Client gallery: click thumbs to change main preview. */
export function ProductGallery({ images, alt }: ProductGalleryProps) {
  const list = images.filter(Boolean);
  const [active, setActive] = useState(0);
  const current = list[Math.min(active, Math.max(list.length - 1, 0))] || list[0];

  if (!current) return null;

  return (
    <div className='shop-detail__image'>
      <PublicImage
        src={current}
        alt={alt}
        width={480}
        height={360}
        sizes='(max-width: 768px) 100vw, 480px'
        priority
        style={{ width: '100%', height: 'auto' }}
      />
      {list.length > 1 ? (
        <div className='shop-detail__thumbs' role='list'>
          {list.map((src, i) => (
            <button
              key={`${src}-${i}`}
              type='button'
              role='listitem'
              className={
                'shop-detail__thumb-btn' + (i === active ? ' is-active' : '')
              }
              onClick={() => setActive(i)}
              aria-label={`Фото ${i + 1}`}
              aria-current={i === active ? 'true' : undefined}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={src} alt='' className='shop-detail__thumb' loading='lazy' />
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
