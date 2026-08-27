import type { ImagePresetId } from '@/lib/image-presets';
import type { MediaPurpose } from '@/lib/media-purpose';
import { parseRetryAfterSeconds, rateLimitMessage } from './rateLimitUi';

export type UploadImageOptions = {
  preset?: ImagePresetId | string;
  purpose?: MediaPurpose | string;
  folderId?: string;
  tags?: string[] | string;
  maxWidth?: number;
  maxHeight?: number;
};

export type UploadImageResult = {
  url: string;
  error?: string;
  width?: number;
  height?: number;
  optimized?: boolean;
  purpose?: string;
  kind?: 'image' | 'video';
};

export async function uploadImage(
  file: File,
  options?: UploadImageOptions,
): Promise<UploadImageResult> {
  const formData = new FormData();
  formData.append('file', file);
  if (options?.preset) {
    formData.append('preset', String(options.preset));
  }
  if (options?.purpose) {
    formData.append('purpose', String(options.purpose));
  }
  if (options?.folderId) {
    formData.append('folderId', String(options.folderId));
  }
  if (options?.tags != null) {
    const tags =
      Array.isArray(options.tags) ? options.tags.join(',') : String(options.tags);
    if (tags.trim()) formData.append('tags', tags);
  }
  if (options?.maxWidth != null && Number.isFinite(options.maxWidth)) {
    formData.append('maxWidth', String(Math.round(options.maxWidth)));
  }
  if (options?.maxHeight != null && Number.isFinite(options.maxHeight)) {
    formData.append('maxHeight', String(Math.round(options.maxHeight)));
  }

  try {
    const res = await fetch('/api/upload', { method: 'POST', body: formData });

    if (res.status === 429) {
      const seconds = parseRetryAfterSeconds(res, 60);
      return { url: '', error: rateLimitMessage(seconds, 'upload') };
    }

    const json = (await res.json().catch(() => ({}))) as {
      url?: string;
      error?: string;
      width?: number;
      height?: number;
      optimized?: boolean;
      purpose?: string;
      kind?: 'image' | 'video';
    };

    if (!res.ok) {
      return { url: '', error: json.error || 'Upload failed' };
    }

    return {
      url: json.url || '',
      error: json.url ? undefined : 'No URL returned',
      width: json.width,
      height: json.height,
      optimized: json.optimized,
      purpose: json.purpose,
      kind: json.kind,
    };
  } catch {
    return { url: '', error: 'Network error' };
  }
}

/** Upload a product review video (mp4/webm). Same endpoint, video MIME path. */
export async function uploadVideo(
  file: File,
  options?: Pick<UploadImageOptions, 'purpose' | 'folderId' | 'tags'>,
): Promise<UploadImageResult> {
  return uploadImage(file, {
    purpose: options?.purpose || 'product',
    folderId: options?.folderId,
    tags: options?.tags,
  });
}
