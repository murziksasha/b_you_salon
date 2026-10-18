import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./image-optimize', () => ({
  optimizeImageUpload: vi.fn(),
}));

vi.mock('./atomic-write', () => ({
  atomicWriteFile: vi.fn(),
}));

vi.mock('./media-index', () => ({
  upsertMediaMeta: vi.fn(),
}));

vi.mock('./uploads-path', () => ({
  uploadsDir: vi.fn(() => 'test-uploads-dir'),
}));

vi.mock('./id', () => ({
  createId: vi.fn(() => 'mock-id'),
}));

vi.mock('fs', () => ({
  promises: {
    mkdir: vi.fn().mockResolvedValue(undefined),
  },
}));

import { optimizeImageUpload } from './image-optimize';
import { atomicWriteFile } from './atomic-write';
import { upsertMediaMeta } from './media-index';
import { fetchAndStoreImage } from './fetch-remote-image';

describe('fetch-remote-image', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('returns null if remoteUrl is empty or not http(s)', async () => {
    expect(await fetchAndStoreImage('')).toBeNull();
    expect(await fetchAndStoreImage('ftp://example.com/pic.jpg')).toBeNull();
    expect(await fetchAndStoreImage('relative/path.jpg')).toBeNull();
  });

  it('returns null if fetch fails or returns non-ok status', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
    } as unknown as Response);

    const res = await fetchAndStoreImage('https://example.com/notfound.jpg');
    expect(res).toBeNull();
  });

  it('returns null if fetch throws network error', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('Network error'));

    const res = await fetchAndStoreImage('https://example.com/pic.jpg');
    expect(res).toBeNull();
  });

  it('returns null if content-length exceeds max limit', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      headers: new Headers({ 'content-length': String(11 * 1024 * 1024) }),
      arrayBuffer: vi.fn(),
    } as unknown as Response);

    const res = await fetchAndStoreImage('https://example.com/large.jpg');
    expect(res).toBeNull();
  });

  it('returns null if optimizeImageUpload throws', async () => {
    const fakeBuffer = Buffer.from('fake image data');
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      headers: new Headers({ 'content-length': String(fakeBuffer.length) }),
      arrayBuffer: async () => fakeBuffer.buffer,
    } as unknown as Response);

    vi.mocked(optimizeImageUpload).mockRejectedValue(new Error('Corrupt image'));

    const res = await fetchAndStoreImage('https://example.com/corrupt.png');
    expect(res).toBeNull();
  });

  it('downloads, optimizes, writes file and upserts media metadata on success', async () => {
    const fakeBuffer = Buffer.from('fake image data');
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      headers: new Headers({ 'content-length': String(fakeBuffer.length) }),
      arrayBuffer: async () => fakeBuffer.buffer,
    } as unknown as Response);

    vi.mocked(optimizeImageUpload).mockResolvedValue({
      buffer: Buffer.from('optimized webp'),
      ext: '.webp',
      contentType: 'image/webp',
      optimized: true,
      width: 800,
      height: 600,
    });
    vi.mocked(atomicWriteFile).mockResolvedValue(undefined);
    vi.mocked(upsertMediaMeta).mockResolvedValue(undefined as never);

    const res = await fetchAndStoreImage('https://example.com/products/sample.jpg', 'product');

    expect(res).toMatch(/^\/uploads\/\d+-mock-id\.webp$/);
    expect(atomicWriteFile).toHaveBeenCalledTimes(1);
    expect(upsertMediaMeta).toHaveBeenCalledWith(
      expect.objectContaining({
        url: res,
        purpose: 'product',
        width: 800,
        height: 600,
      }),
    );
  });
});
