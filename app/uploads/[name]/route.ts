import { promises as fs } from 'fs';
import path from 'path';
import { NextRequest, NextResponse } from 'next/server';
import { isSafeUploadName, uploadsDir } from '@/lib/media';
import { contentTypeForUploadName } from '@/lib/uploads-path';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * Serve uploaded files from the durable UPLOADS_DIR even when Next standalone
 * static `public/` is a stale snapshot (no PM2 restart required).
 */
export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ name: string }> },
) {
  const { name: raw } = await context.params;
  const name = decodeURIComponent(raw || '');

  if (!isSafeUploadName(name)) {
    return new NextResponse('Not found', { status: 404 });
  }

  const filePath = path.join(uploadsDir(), name);
  try {
    const data = await fs.readFile(filePath);
    return new NextResponse(data, {
      status: 200,
      headers: {
        'Content-Type': contentTypeForUploadName(name),
        'Content-Length': String(data.length),
        'Cache-Control': 'public, max-age=31536000, immutable',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch {
    return new NextResponse('Not found', { status: 404 });
  }
}
