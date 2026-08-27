/**
 * Upload resize presets for different admin use-cases.
 * Server clamps client maxWidth/maxHeight; presets are the preferred API.
 */

export const IMAGE_PRESET_IDS = ['default', 'product', 'logo', 'hero', 'og'] as const;

export type ImagePresetId = (typeof IMAGE_PRESET_IDS)[number];

export type ImagePresetConfig = {
  id: ImagePresetId;
  /** Max width (px); used with fit */
  maxWidth: number;
  /** Max height (px) */
  maxHeight: number;
  fit: 'inside' | 'cover' | 'contain';
  /** Ukrainian label for admin UI */
  label: string;
  description: string;
};

export const IMAGE_PRESETS: Record<ImagePresetId, ImagePresetConfig> = {
  default: {
    id: 'default',
    maxWidth: 1920,
    maxHeight: 1920,
    fit: 'inside',
    label: 'Загальне',
    description: 'До 1920×1920 (контент, галерея)',
  },
  product: {
    id: 'product',
    maxWidth: 1200,
    maxHeight: 900,
    fit: 'inside',
    label: 'Товар',
    description: 'Картка / каталог, до 1200×900',
  },
  logo: {
    id: 'logo',
    maxWidth: 512,
    maxHeight: 512,
    fit: 'inside',
    label: 'Логотип',
    description: 'Лого / favicon / іконки, до 512×512',
  },
  hero: {
    id: 'hero',
    maxWidth: 1920,
    maxHeight: 1080,
    fit: 'inside',
    label: 'Hero',
    description: 'Банери / секції, до 1920×1080',
  },
  og: {
    id: 'og',
    maxWidth: 1200,
    maxHeight: 630,
    fit: 'inside',
    label: 'OG / share',
    description: 'Соцмережі, до 1200×630',
  },
};

export const DEFAULT_MAX_EDGE = 1920;
export const MIN_OPTIMIZE_EDGE = 64;
export const MAX_OPTIMIZE_EDGE = 4096;

export type OptimizeConstraints = {
  maxWidth: number;
  maxHeight: number;
  fit: 'inside' | 'cover' | 'contain';
};

function clampEdge(n: number): number {
  if (!Number.isFinite(n)) return DEFAULT_MAX_EDGE;
  return Math.min(MAX_OPTIMIZE_EDGE, Math.max(MIN_OPTIMIZE_EDGE, Math.round(n)));
}

export function isImagePresetId(value: string): value is ImagePresetId {
  return (IMAGE_PRESET_IDS as readonly string[]).includes(value);
}

/**
 * Resolve resize constraints from preset and/or explicit max dimensions.
 * Explicit maxWidth/maxHeight override the preset numbers when provided.
 */
export function resolveOptimizeConstraints(input?: {
  preset?: string | null;
  maxWidth?: number | null;
  maxHeight?: number | null;
  fit?: string | null;
}): OptimizeConstraints {
  const presetId =
    input?.preset && isImagePresetId(input.preset) ? input.preset : 'default';
  const base = IMAGE_PRESETS[presetId];

  let maxWidth = base.maxWidth;
  let maxHeight = base.maxHeight;
  let fit: OptimizeConstraints['fit'] = base.fit;

  if (input?.maxWidth != null && Number.isFinite(input.maxWidth)) {
    maxWidth = clampEdge(input.maxWidth);
  } else {
    maxWidth = clampEdge(maxWidth);
  }

  if (input?.maxHeight != null && Number.isFinite(input.maxHeight)) {
    maxHeight = clampEdge(input.maxHeight);
  } else {
    maxHeight = clampEdge(maxHeight);
  }

  if (input?.fit === 'cover' || input?.fit === 'contain' || input?.fit === 'inside') {
    fit = input.fit;
  }

  return { maxWidth, maxHeight, fit };
}
