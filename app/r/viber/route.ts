import { NextRequest, NextResponse } from 'next/server';
import { clientKey, rateLimit } from '@/lib/rate-limit';
import { verifyViberPhone } from '@/lib/viber-go';

export const dynamic = 'force-dynamic';

/**
 * Public HMAC-signed redirect: Telegram url buttons cannot use viber://.
 * GET /r/viber?p=380…&s=hmac → 302 viber://chat?number=%2B380…
 */
export async function GET(request: NextRequest) {
  const rl = rateLimit(clientKey(request, 'viber-go'), { limit: 30, windowMs: 60_000 });
  if (!rl.allowed) {
    return new NextResponse('Too many requests', { status: 429 });
  }

  const digits = (request.nextUrl.searchParams.get('p') || '').replace(/\D/g, '');
  const sig = request.nextUrl.searchParams.get('s') || '';
  if (!digits || digits.length < 10 || digits.length > 15 || !verifyViberPhone(digits, sig)) {
    return new NextResponse('Not found', { status: 404 });
  }

  const target = `viber://chat?number=%2B${digits}`;
  return new NextResponse(null, {
    status: 302,
    headers: {
      Location: target,
      'Cache-Control': 'no-store',
      'X-Robots-Tag': 'noindex, nofollow',
    },
  });
}
