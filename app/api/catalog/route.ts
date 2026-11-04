import { NextRequest, NextResponse } from 'next/server';
import { clientKey, rateLimit } from '@/lib/rate-limit';
import { getProducts } from '@/lib/site-data';
import { collectCategories, queryCatalog } from '@/lib/shop-catalog';
import { catalogQuerySchema } from '@/lib/schemas/catalog';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const rl = rateLimit(clientKey(request, 'catalog'), { limit: 60, windowMs: 60_000 });
  if (!rl.allowed) {
    const retryAfter = Math.ceil(rl.retryAfterMs / 1000) || 60;
    return NextResponse.json(
      { error: 'Забагато запитів. Зачекайте хвилину.' },
      { status: 429, headers: { 'Retry-After': String(retryAfter) } },
    );
  }

  const { searchParams } = new URL(request.url);
  const parsed = catalogQuerySchema.safeParse({
    q: searchParams.get('q') || undefined,
    sort: searchParams.get('sort') || undefined,
    category: searchParams.get('category') || undefined,
    page: searchParams.get('page') || undefined,
    pageSize: searchParams.get('pageSize') || undefined,
  });

  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Некоректні параметри запиту', details: parsed.error.issues },
      { status: 400 },
    );
  }

  const products = await getProducts();
  const visible = products.filter((p) => p.visible);
  const categories = collectCategories(visible);
  const result = queryCatalog(products, {
    query: parsed.data.q,
    sort: parsed.data.sort,
    category: parsed.data.category,
    page: parsed.data.page,
    pageSize: parsed.data.pageSize,
  });

  return NextResponse.json({
    ...result,
    categories,
  });
}

