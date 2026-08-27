import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import { optimizeImageUpload } from './image-optimize';
import { resolveOptimizeConstraints, isImagePresetId } from './image-presets';

describe('optimizeImageUpload', () => {
  it('keeps PNG as PNG (does not force WebP)', async () => {
    const png = await sharp({
      create: {
        width: 64,
        height: 32,
        channels: 4,
        background: { r: 2, g: 166, b: 83, alpha: 0.8 },
      },
    })
      .png()
      .toBuffer();

    const result = await optimizeImageUpload(png, '.png');
    expect(result.ext).toBe('.png');
    expect(result.contentType).toBe('image/png');
  });

  it('converts JPEG to WebP', async () => {
    const jpg = await sharp({
      create: {
        width: 40,
        height: 40,
        channels: 3,
        background: { r: 200, g: 100, b: 50 },
      },
    })
      .jpeg()
      .toBuffer();

    const result = await optimizeImageUpload(jpg, '.jpg');
    expect(result.ext).toBe('.webp');
    expect(result.contentType).toBe('image/webp');
    expect(result.optimized).toBe(true);
  });

  it('leaves GIF unchanged', async () => {
    // Minimal GIF89a 1x1
    const gif = Buffer.from(
      '47494638396101000100800000ffffff00000021f90401000000002c000000000100010000020144003b',
      'hex',
    );
    const result = await optimizeImageUpload(gif, '.gif');
    expect(result.ext).toBe('.gif');
    expect(result.optimized).toBe(false);
    expect(result.buffer.equals(gif)).toBe(true);
  });

  it('resizes by product preset max bounds', async () => {
    const jpg = await sharp({
      create: {
        width: 2000,
        height: 1500,
        channels: 3,
        background: { r: 10, g: 20, b: 30 },
      },
    })
      .jpeg()
      .toBuffer();

    const result = await optimizeImageUpload(jpg, '.jpg', { preset: 'product' });
    expect(result.ext).toBe('.webp');
    expect(result.width).toBeDefined();
    expect(result.height).toBeDefined();
    expect(result.width!).toBeLessThanOrEqual(1200);
    expect(result.height!).toBeLessThanOrEqual(900);
  });

  it('respects custom maxWidth/maxHeight', async () => {
    const jpg = await sharp({
      create: {
        width: 800,
        height: 600,
        channels: 3,
        background: { r: 50, g: 50, b: 50 },
      },
    })
      .jpeg()
      .toBuffer();

    const result = await optimizeImageUpload(jpg, '.jpg', { maxWidth: 200, maxHeight: 200 });
    expect(result.width!).toBeLessThanOrEqual(200);
    expect(result.height!).toBeLessThanOrEqual(200);
  });
});

describe('resolveOptimizeConstraints', () => {
  it('defaults to 1920 inside', () => {
    const c = resolveOptimizeConstraints();
    expect(c.maxWidth).toBe(1920);
    expect(c.maxHeight).toBe(1920);
    expect(c.fit).toBe('inside');
  });

  it('maps logo preset', () => {
    const c = resolveOptimizeConstraints({ preset: 'logo' });
    expect(c.maxWidth).toBe(512);
    expect(c.maxHeight).toBe(512);
  });

  it('explicit max overrides preset', () => {
    const c = resolveOptimizeConstraints({ preset: 'logo', maxWidth: 256, maxHeight: 128 });
    expect(c.maxWidth).toBe(256);
    expect(c.maxHeight).toBe(128);
  });

  it('clamps extreme edges', () => {
    const c = resolveOptimizeConstraints({ maxWidth: 99999, maxHeight: 1 });
    expect(c.maxWidth).toBe(4096);
    expect(c.maxHeight).toBe(64);
  });

  it('isImagePresetId', () => {
    expect(isImagePresetId('product')).toBe(true);
    expect(isImagePresetId('nope')).toBe(false);
  });
});
