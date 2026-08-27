'use client';

import Image, { type ImageProps } from 'next/image';
import { useState, type CSSProperties } from 'react';

export type PublicImageProps = Omit<ImageProps, 'onLoad' | 'onLoadingComplete'> & {
  /** Soft background while decoding (defaults on). Avoids clash with next/image `placeholder`. */
  softPlaceholder?: boolean;
  /** Extra class on the outer wrapper. */
  wrapperClassName?: string;
  /** Named view-transition element (e.g. service-hero). */
  viewTransitionName?: string;
  /** object-position focus (0–100). */
  focusX?: number;
  focusY?: number;
};

function srcKey(src: ImageProps['src']): string {
  if (typeof src === 'string') return src;
  if (src && typeof src === 'object' && 'src' in src) return String(src.src);
  return '';
}

/**
 * Public-site image with reserved box, soft reveal after decode, and optional
 * view-transition name. Priority images stay visible immediately (LCP-safe).
 */
export function PublicImage({
  className,
  wrapperClassName,
  softPlaceholder = true,
  viewTransitionName,
  priority,
  src,
  alt,
  focusX,
  focusY,
  style: styleProp,
  ...rest
}: PublicImageProps) {
  const key = srcKey(src);
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const loaded = loadedKey === key;

  const wrapClass = [
    'ps-image',
    softPlaceholder ? 'ps-image--placeholder' : '',
    loaded || priority ? 'is-ready' : '',
    wrapperClassName || '',
  ]
    .filter(Boolean)
    .join(' ');

  const imgClass = ['ps-image__img', loaded ? 'is-loaded' : '', priority ? 'is-priority' : '', className || '']
    .filter(Boolean)
    .join(' ');

  const objectPosition =
    focusX != null || focusY != null
      ? `${focusX != null && Number.isFinite(focusX) ? focusX : 50}% ${
          focusY != null && Number.isFinite(focusY) ? focusY : 50
        }%`
      : undefined;

  const style: CSSProperties = {
    ...(styleProp as CSSProperties | undefined),
    ...(viewTransitionName ? ({ viewTransitionName } as CSSProperties) : {}),
    ...(objectPosition ? { objectPosition } : {}),
  };

  return (
    <span className={wrapClass} style={viewTransitionName ? ({ viewTransitionName } as CSSProperties) : undefined}>
      <Image
        {...rest}
        src={src}
        alt={alt}
        priority={priority}
        className={imgClass}
        style={Object.keys(style).length ? style : undefined}
        onLoad={() => setLoadedKey(key)}
        onLoadingComplete={() => setLoadedKey(key)}
      />
    </span>
  );
}
