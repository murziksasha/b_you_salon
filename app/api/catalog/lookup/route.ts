import { NextRequest, NextResponse } from 'next/server';
import { clientKey, rateLimit } from '@/lib/rate-limit';
import { getProducts } from '@/lib/site-data';
import { toProductCardDTO } from '@/lib/shop-catalog';
import { catalogLookupSchema } from '@/lib/schemas/catalog';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const rl = rateLimit(clientKey(request, 'catalog-lookup'), { limit: 60, windowMs: 60_000 });
  if (!rl.allowed) {
    const retryAfter = Math.ceil(rl.retryAfterMs / 1000) || 60;
    return NextResponse.json(
      { error: 'Забагато запитів. Зачекайте хвилину.' },
      { status: 429, headers: { 'Retry-After': String(retryAfter) } },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Некоректний JSON' }, { status: 400 });
  }

  const parsed = catalogLookupSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Некоректні параметри запиту', details: parsed.error.issues },
      { status: 400 },
    );
  }

  const products = await getProducts();
  const byId = new Map(products.filter((p) => p.visible).map((p) => [p.id, p]));

  // Return only visible found products mapped to ProductCardDTO, preserving input order
  const items = parsed.data.ids
    .map((id) => byId.get(id))
    .filter((p): p is NonNullable<typeof p> => Boolean(p))
    .map(toProductCardDTO);

  return NextResponse.json({ items });
}

