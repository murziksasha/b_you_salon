import { NextRequest, NextResponse } from 'next/server';
import { deleteOrder, listOrders, updateOrder } from '@/lib/orders';
import { clampQty, MAX_LINES } from '@/lib/cart';
import { clientKey, rateLimit } from '@/lib/rate-limit';
import { isValidUaPhone, normalizePhoneCanonical } from '@/lib/phone';
import { getSiteData } from '@/lib/site-data';
import { resolveFormFlow } from '@/lib/form-flow';
import { sanitizePagePath } from '@/lib/page-path';
import { placeShopOrder } from '@/lib/place-shop-order';
import { toCsv } from '@/lib/csv';
import { isWorkflowStatus } from '@/lib/workflow';
import { requireAdminRole } from '@/lib/require-role';
import { orderPatchBodySchema, parseOrError } from '@/lib/validation';

export const dynamic = 'force-dynamic';

const MAX_COMMENT = 1000;

async function guard() {
  return requireAdminRole('orders');
}

/** Public: create shop order */
export async function POST(request: NextRequest) {
  const rl = rateLimit(clientKey(request, 'order'), { limit: 8, windowMs: 60_000 });
  if (!rl.allowed) {
    const retryAfter = Math.ceil(rl.retryAfterMs / 1000) || 60;
    return NextResponse.json(
      { error: 'Too many requests', retryAfter },
      { status: 429, headers: { 'Retry-After': String(retryAfter) } },
    );
  }

  try {
    let phone = '';
    let productId = '';
    let comment = '';
    let honeypot = '';
    let name = '';
    let fulfillment: 'pickup' | 'delivery' = 'pickup';
    let address = '';
    let pagePathRaw: unknown;
    let intentRaw: unknown;
    let rawItems: Array<{ id?: string; qty?: number }> = [];

    const contentType = request.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      const body = await request.json();
      phone = typeof body.phone === 'string' ? body.phone : '';
      productId = typeof body.productId === 'string' ? body.productId : '';
      comment = typeof body.comment === 'string' ? body.comment : '';
      honeypot = typeof body.website === 'string' ? body.website : '';
      name = typeof body.name === 'string' ? body.name : '';
      fulfillment = body.fulfillment === 'delivery' ? 'delivery' : 'pickup';
      address = typeof body.address === 'string' ? body.address : '';
      pagePathRaw = body.pagePath;
      intentRaw = body.intent;
      if (Array.isArray(body.items)) rawItems = body.items as Array<{ id?: string; qty?: number }>;
    } else {
      const formData = await request.formData();
      phone = String(formData.get('phone') || '');
      productId = String(formData.get('productId') || '');
      comment = String(formData.get('comment') || '');
      honeypot = String(formData.get('website') || '');
      name = String(formData.get('name') || '');
      fulfillment = String(formData.get('fulfillment') || '') === 'delivery' ? 'delivery' : 'pickup';
      address = String(formData.get('address') || '');
      pagePathRaw = formData.get('pagePath');
      intentRaw = formData.get('intent');
    }

    // Honeypot: bots that fill hidden field get soft success without store/mail
    if (honeypot.trim()) {
      return NextResponse.json({ ok: true, emailed: false });
    }

    phone = normalizePhoneCanonical(phone);
    productId = productId.trim();
    comment = comment.trim().slice(0, MAX_COMMENT);
    name = name.trim().slice(0, 80);
    address = address.trim().slice(0, 300);

    if (!phone) {
      return NextResponse.json({ error: 'Missing phone' }, { status: 400 });
    }
    if (!isValidUaPhone(phone)) {
      return NextResponse.json({ error: 'Invalid phone' }, { status: 400 });
    }
    if (fulfillment === 'delivery' && address.length < 5) {
      return NextResponse.json({ error: 'Missing address' }, { status: 400 });
    }

    if (!rawItems.length && productId) {
      rawItems = [{ id: productId, qty: 1 }];
    }

    const pagePath = sanitizePagePath(pagePathRaw);
    const flow = resolveFormFlow({ pagePath, intent: intentRaw });
    const allowConsult = !rawItems.length && flow === 'sales';

    if (!rawItems.length && !allowConsult) {
      return NextResponse.json({ error: 'Missing items' }, { status: 400 });
    }

    const snapshots: Array<{
      id: string;
      title: string;
      price: number;
      qty: number;
      code?: string;
      image?: string;
    }> = [];
    if (!allowConsult) {
      const site = await getSiteData();
      const goods = site.goods || [];
      for (const row of rawItems.slice(0, MAX_LINES)) {
        const id = typeof row.id === 'string' ? row.id.trim() : '';
        if (!id) continue;
        const product = goods.find((g) => g.id === id);
        if (!product || !product.visible || product.inStock === false) {
          return NextResponse.json({ error: 'Product not available' }, { status: 400 });
        }
        snapshots.push({
          id: product.id,
          title: product.title,
          price: product.price,
          qty: clampQty(Number(row.qty)),
          code: product.code,
          image: product.image,
        });
      }
      if (!snapshots.length) {
        return NextResponse.json({ error: 'Product not available' }, { status: 400 });
      }
    }

    const placed = await placeShopOrder({
      phone,
      comment: comment || undefined,
      name: name || undefined,
      items: snapshots,
      fulfillment,
      address: fulfillment === 'delivery' ? address : undefined,
      consult: allowConsult,
      pagePath: pagePath || undefined,
    });

    if (!placed.order && !placed.emailed) {
      return NextResponse.json({ error: 'Failed to save order' }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      emailed: placed.emailed,
      telegram: placed.telegram,
      orderId: placed.order?.id,
      consult: allowConsult,
      dev: placed.dev,
    });
  } catch (err) {
    console.error('Order error:', err);
    return NextResponse.json({ error: 'Failed to place order' }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  const g = await guard();
  if (!g.ok) return g.response;

  const orders = await listOrders();
  const format = request.nextUrl.searchParams.get('format');
  if (format === 'csv') {
    const csv = toCsv(
      ['id', 'createdAt', 'phone', 'product', 'code', 'price', 'comment', 'status', 'handled', 'note', 'emailed', 'callbackAt'],
      orders.map((o) => [
        o.id,
        o.createdAt,
        o.phone,
        (o.items || [o.product]).map((i) => ('qty' in i ? `${i.title}×${i.qty}` : i.title)).join('; '),
        o.product.code || '',
        o.total ?? o.product.price,
        o.comment || '',
        o.status || '',
        o.handled,
        o.note || '',
        o.emailed,
        o.callbackAt || '',
      ]),
    );
    return new NextResponse(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': 'attachment; filename="orders.csv"',
      },
    });
  }
  return NextResponse.json({
    orders,
    total: orders.length,
    unhandled: orders.filter((o) => !o.handled).length,
  });
}

export async function PATCH(request: NextRequest) {
  const g = await guard();
  if (!g.ok) return g.response;

  try {
    const parsed = parseOrError(orderPatchBodySchema, await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error }, { status: 400 });
    }
    const body = parsed.data;
    if (body.status !== undefined && !isWorkflowStatus(body.status)) {
      return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
    }
    const updated = await updateOrder(body.id, {
      handled: body.handled,
      note: body.note,
      status: body.status as undefined | import('@/lib/workflow').WorkflowStatus,
      callbackAt: body.callbackAt,
      outcome: body.outcome as undefined | import('@/lib/workflow').CloseOutcome,
      assignee: body.assignee,
    });
    if (!updated) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    return NextResponse.json({ ok: true, order: updated });
  } catch {
    return NextResponse.json({ error: 'Bad request' }, { status: 400 });
  }
}

export async function DELETE(request: NextRequest) {
  const g = await guard();
  if (!g.ok) return g.response;

  try {
    const body = (await request.json()) as { id?: string };
    if (!body.id || typeof body.id !== 'string') {
      return NextResponse.json({ error: 'Missing id' }, { status: 400 });
    }
    const ok = await deleteOrder(body.id);
    if (!ok) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: 'Bad request' }, { status: 400 });
  }
}
