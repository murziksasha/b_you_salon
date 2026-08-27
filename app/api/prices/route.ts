import { NextRequest, NextResponse } from 'next/server';
import { requireAdminRole } from '@/lib/require-role';
import { listPriceHistory } from '@/lib/price-history';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const g = await requireAdminRole('content');
  if (!g.ok) return g.response;
  const productId = request.nextUrl.searchParams.get('productId') || undefined;
  const limit = Number(request.nextUrl.searchParams.get('limit') || 40) || 40;
  const entries = await listPriceHistory(productId || undefined, limit);
  return NextResponse.json({ entries });
}
