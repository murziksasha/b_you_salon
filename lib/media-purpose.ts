/**
 * Organizational groups for the media library (not the same as resize presets,
 * though UI maps them for convenience).
 */

export const MEDIA_PURPOSE_IDS = [
  'product',
  'hero',
  'section',
  'logo',
  'feedback',
  'og',
  'other',
] as const;

export type MediaPurpose = (typeof MEDIA_PURPOSE_IDS)[number];

export type MediaPurposeConfig = {
  id: MediaPurpose;
  label: string;
  description: string;
};

export const MEDIA_PURPOSES: Record<MediaPurpose, MediaPurposeConfig> = {
  product: {
    id: 'product',
    label: 'Товар',
    description: 'Картки каталогу / галерея товару',
  },
  hero: {
    id: 'hero',
    label: 'Hero / банер',
    description: 'Головні банери секцій',
  },
  section: {
    id: 'section',
    label: 'Блок сторінки',
    description: 'Іконки послуг, переваги, несправності…',
  },
  logo: {
    id: 'logo',
    label: 'Лого / іконки',
    description: 'Логотип, favicon, соцмережі',
  },
  feedback: {
    id: 'feedback',
    label: 'Відгуки',
    description: 'Скріни / фото відгуків',
  },
  og: {
    id: 'og',
    label: 'OG / share',
    description: 'Превʼю для соцмереж',
  },
  other: {
    id: 'other',
    label: 'Інше',
    description: 'Без категорії',
  },
};

export function isMediaPurpose(value: string): value is MediaPurpose {
  return (MEDIA_PURPOSE_IDS as readonly string[]).includes(value);
}

/** Map resize preset id → default library purpose. */
export function purposeFromPreset(preset?: string | null): MediaPurpose {
  switch (preset) {
    case 'product':
      return 'product';
    case 'logo':
      return 'logo';
    case 'hero':
      return 'hero';
    case 'og':
      return 'og';
    default:
      return 'other';
  }
}
