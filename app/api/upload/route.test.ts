import { describe, expect, it, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/require-role', () => ({
  requireAdminRole: vi.fn(),
}));

vi.mock('@/lib/image-optimize', () => ({
  optimizeImageUpload: vi.fn(),
}));

vi.mock('@/lib/media-index', () => ({
  upsertMediaMeta: vi.fn(),
}));

vi.mock('@/lib/atomic-write', () => ({
  atomicWriteFile: vi.fn(),
}));

import { requireAdminRole } from '@/lib/require-role';
import { optimizeImageUpload } from '@/lib/image-optimize';
import { POST } from './route';
import { GET } from '@/app/uploads/[name]/route';
import { formatKyivDateTime } from '@/lib/quiet-hours';
import { promises as fs } from 'fs';

describe('POST /api/upload', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireAdminRole).mockResolvedValue({
      ok: true,
      access: { username: 'admin', role: 'owner', capabilities: ['media'] },
    } as any);
  });

  it('rejects replacement when extension differs with Ukrainian admin error', async () => {
    // 3 magic bytes for webp: RIFF....WEBP
    const webpHeader = Buffer.from([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50, 0, 0, 0, 0]);
    vi.mocked(optimizeImageUpload).mockResolvedValue({
      buffer: webpHeader,
      ext: '.webp',
      contentType: 'image/webp',
      optimized: true,
      width: 100,
      height: 100,
    });

    const formData = new FormData();
    const blob = new Blob([webpHeader], { type: 'image/webp' });
    formData.append('file', blob, 'new-photo.webp');
    formData.append('replaceName', 'existing-photo.jpg'); // Replacing a .jpg with a .webp!

    const req = new NextRequest('http://localhost:3000/api/upload', {
      method: 'POST',
      body: formData,
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe('Розширення нового файлу має збігатися з оригіналом');
  });

  it('allows replacement when extensions match', async () => {
    const webpHeader = Buffer.from([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50, 0, 0, 0, 0]);
    vi.mocked(optimizeImageUpload).mockResolvedValue({
      buffer: webpHeader,
      ext: '.webp',
      contentType: 'image/webp',
      optimized: true,
      width: 100,
      height: 100,
    });

    const formData = new FormData();
    const blob = new Blob([webpHeader], { type: 'image/webp' });
    formData.append('file', blob, 'new-photo.webp');
    formData.append('replaceName', 'existing-photo.webp'); // Matching extension!

    const req = new NextRequest('http://localhost:3000/api/upload', {
      method: 'POST',
      body: formData,
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.url).toBe('/uploads/existing-photo.webp');
  });
});

describe('GET /uploads/[name]', () => {
  it('serves with Cache-Control: public, max-age=86400, must-revalidate', async () => {
    vi.spyOn(fs, 'readFile').mockResolvedValue(Buffer.from('fake-image-bytes') as any);

    const req = new NextRequest('http://localhost:3000/uploads/banner.webp');
    const res = await GET(req, { params: Promise.resolve({ name: 'banner.webp' }) });

    expect(res.status).toBe(200);
    expect(res.headers.get('Cache-Control')).toBe('public, max-age=86400, must-revalidate');
    expect(res.headers.get('Content-Type')).toBe('image/webp');
  });
});

describe('formatKyivDateTime', () => {
  it('formats dates consistently in Europe/Kyiv', () => {
    // 2026-09-06T10:00:00.000Z in Kyiv is 13:00 (UTC+3)
    const formatted = formatKyivDateTime('2026-09-06T10:00:00.000Z');
    expect(formatted).toContain('13:00');
    expect(formatted).toContain('06.09.2026');
  });
});

