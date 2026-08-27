import sharp from 'sharp';
import {
  DEFAULT_MAX_EDGE,
  resolveOptimizeConstraints,
  type OptimizeConstraints,
} from './image-presets';

const WEBP_QUALITY = 82;
const PNG_MAX_EDGE_KEEP = 2400;

export interface OptimizeResult {
  buffer: Buffer;
  ext: '.webp' | '.jpg' | '.png' | '.gif';
  contentType: string;
  optimized: boolean;
  width?: number;
  height?: number;
}

export type OptimizeImageOptions = {
  maxWidth?: number;
  maxHeight?: number;
  fit?: 'inside' | 'cover' | 'contain';
  preset?: string;
};

/**
 * Resize large images. JPEG → WebP. PNG stays PNG (logos/UI assets with alpha).
 * GIF left as-is. Falls back to original buffer if sharp fails.
 */
export async function optimizeImageUpload(
  input: Buffer,
  sourceExt: string,
  options?: OptimizeImageOptions,
): Promise<OptimizeResult> {
  const ext = sourceExt.toLowerCase();
  const constraints: OptimizeConstraints = resolveOptimizeConstraints({
    preset: options?.preset,
    maxWidth: options?.maxWidth,
    maxHeight: options?.maxHeight,
    fit: options?.fit,
  });

  // Animated / simple GIF: keep as-is
  if (ext === '.gif') {
    return {
      buffer: input,
      ext: '.gif',
      contentType: 'image/gif',
      optimized: false,
    };
  }

  try {
    let pipeline = sharp(input, { failOn: 'none' }).rotate();
    const meta = await pipeline.metadata();
    const w = meta.width || 0;
    const h = meta.height || 0;

    const maxW = constraints.maxWidth || DEFAULT_MAX_EDGE;
    const maxH = constraints.maxHeight || DEFAULT_MAX_EDGE;
    const needsResize = w > maxW || h > maxH;

    if (needsResize) {
      pipeline = pipeline.resize({
        width: maxW,
        height: maxH,
        fit: constraints.fit,
        withoutEnlargement: true,
      });
    }

    // Never convert PNG → WebP (logos, icons, UI graphics break or lose crisp edges)
    if (ext === '.png') {
      const maxEdge = Math.max(w, h);
      // Very large PNGs still get resized above; re-encode with compression
      if (!needsResize && maxEdge > 0 && maxEdge <= PNG_MAX_EDGE_KEEP && input.length < 1.5 * 1024 * 1024) {
        // Light re-encode only if we can shrink a bit; otherwise keep original bytes
        const buffer = await pipeline.png({ compressionLevel: 9 }).toBuffer();
        if (buffer.length < input.length * 0.98) {
          const outMeta = await sharp(buffer).metadata();
          return {
            buffer,
            ext: '.png',
            contentType: 'image/png',
            optimized: true,
            width: outMeta.width,
            height: outMeta.height,
          };
        }
        return {
          buffer: input,
          ext: '.png',
          contentType: 'image/png',
          optimized: false,
          width: w || undefined,
          height: h || undefined,
        };
      }
      const buffer = await pipeline.png({ compressionLevel: 9 }).toBuffer();
      const outMeta = await sharp(buffer).metadata();
      return {
        buffer,
        ext: '.png',
        contentType: 'image/png',
        optimized: true,
        width: outMeta.width,
        height: outMeta.height,
      };
    }

    // Incoming WebP: re-encode with quality cap + resize if needed
    if (ext === '.webp') {
      const buffer = await pipeline.webp({ quality: WEBP_QUALITY }).toBuffer();
      const outMeta = await sharp(buffer).metadata();
      return {
        buffer,
        ext: '.webp',
        contentType: 'image/webp',
        optimized: true,
        width: outMeta.width,
        height: outMeta.height,
      };
    }

    // JPEG (and unknown photo-like) → WebP
    const buffer = await pipeline.webp({ quality: WEBP_QUALITY }).toBuffer();
    const outMeta = await sharp(buffer).metadata();
    return {
      buffer,
      ext: '.webp',
      contentType: 'image/webp',
      optimized: true,
      width: outMeta.width,
      height: outMeta.height,
    };
  } catch (err) {
    console.error('[image-optimize] sharp failed, using original', err);
    const fallbackExt =
      ext === '.png' ? '.png' : ext === '.webp' ? '.webp' : ext === '.gif' ? '.gif' : '.jpg';
    const contentType =
      fallbackExt === '.png'
        ? 'image/png'
        : fallbackExt === '.webp'
          ? 'image/webp'
          : fallbackExt === '.gif'
            ? 'image/gif'
            : 'image/jpeg';
    return { buffer: input, ext: fallbackExt, contentType, optimized: false };
  }
}
