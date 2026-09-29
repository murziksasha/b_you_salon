import { NextRequest, NextResponse } from 'next/server';
import { requireAdminRole } from '@/lib/require-role';
import { clientKey, rateLimit } from '@/lib/rate-limit';
import { getSiteData, saveSiteData } from '@/lib/site-data';
import { createId } from '@/lib/id';
import { PRODUCT_PLACEHOLDER_IMAGE } from '@/lib/media-usage';
import {
  parseLivestaJson,
  parseLivestaXml,
  buildCharacteristics,
  detectFeedFormat,
  type FeedProduct,
} from '@/lib/feed-import';
import { fetchAndStoreImage } from '@/lib/fetch-remote-image';
import type { Product } from '@/lib/types';

const FEED_TIMEOUT_MS = 30_000;

async function fetchFeed(url: string): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FEED_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: 'application/json, application/xml, text/xml, */*' },
    });
    if (!res.ok) throw new Error(`Feed responded with ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}

function buildProduct(fp: FeedProduct, imageUrl: string): Omit<Product, 'id'> {
  const characteristics = buildCharacteristics(fp);
  const promoText = fp.rrp && fp.rrp > fp.price ? `До знижки: ${fp.rrp.toLocaleString('uk-UA')} ₴` : undefined;

  return {
    title: fp.name,
    description: fp.description,
    characteristics: characteristics || undefined,
    price: fp.price,
    image: imageUrl || PRODUCT_PLACEHOLDER_IMAGE,
    images: [],
    visible: false, // imported products start hidden — admin reviews and publishes
    code: fp.sku,
    inStock: true,
    promoText,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

export async function POST(request: NextRequest) {
  const g = await requireAdminRole('editor');
  if (!g.ok) return g.response;

  // Rate-limit: 5 imports per 5 minutes
  const rl = rateLimit(clientKey(request, 'import-feed'), { limit: 5, windowMs: 5 * 60_000 });
  if (!rl.allowed) {
    const retryAfter = Math.ceil(rl.retryAfterMs / 1000) || 300;
    return NextResponse.json(
      { error: 'Too many import requests', retryAfter },
      { status: 429, headers: { 'Retry-After': String(retryAfter) } },
    );
  }

  let body: { url?: string; stream?: boolean; downloadImages?: boolean };
  try {
    body = (await request.json()) as { url?: string; stream?: boolean; downloadImages?: boolean };
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const url = (body.url || '').trim();
  if (!url || !/^https?:\/\//i.test(url) || url.length > 600) {
    return NextResponse.json({ error: 'url must be a valid http(s) URL (max 600 chars)' }, { status: 400 });
  }

  const shouldStream = Boolean(body.stream || request.headers.get('accept')?.includes('text/event-stream'));
  const downloadImages = Boolean(body.downloadImages);

  if (shouldStream) {
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        function emit(eventData: object) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(eventData)}\n\n`));
        }

        try {
          emit({ type: 'status', message: 'Отримання фіду з віддаленого сервера…' });

          let rawText: string;
          try {
            rawText = await fetchFeed(url);
          } catch (err) {
            emit({
              type: 'error',
              error: `Не вдалося отримати фід: ${err instanceof Error ? err.message : String(err)}`,
            });
            controller.close();
            return;
          }

          emit({ type: 'status', message: 'Аналіз товарів у фіді…' });
          const format = detectFeedFormat(url, rawText);
          let feedProducts: FeedProduct[];
          try {
            if (format === 'xml') {
              feedProducts = parseLivestaXml(rawText);
            } else {
              const json = JSON.parse(rawText) as unknown;
              feedProducts = parseLivestaJson(json);
            }
          } catch (err) {
            emit({
              type: 'error',
              error: `Помилка структури (${format}): ${err instanceof Error ? err.message : String(err)}`,
            });
            controller.close();
            return;
          }

          if (!feedProducts.length) {
            emit({ type: 'error', error: 'Фід не містить товарів для імпорту' });
            controller.close();
            return;
          }

          const total = feedProducts.length;
          emit({ type: 'start', total, message: `Знайдено ${total} товарів` });

          const siteData = await getSiteData();
          const goods = [...siteData.goods];
          let created = 0;
          let updated = 0;
          const errors: string[] = [];

          // Process in batches so streaming updates are sent smoothly
          const batchSize = downloadImages ? 5 : 50;

          for (let i = 0; i < total; i += batchSize) {
            const chunk = feedProducts.slice(i, i + batchSize);

            await Promise.all(
              chunk.map(async fp => {
                let imageUrl = fp.thumbUrl || PRODUCT_PLACEHOLDER_IMAGE;
                const existingIdx = fp.sku ? goods.findIndex(g => g.code === fp.sku) : -1;

                if (existingIdx >= 0 && goods[existingIdx]?.image?.startsWith('/uploads/')) {
                  imageUrl = goods[existingIdx].image;
                } else if (downloadImages && fp.thumbUrl) {
                  try {
                    const stored = await fetchAndStoreImage(fp.thumbUrl, 'product');
                    if (stored) imageUrl = stored;
                  } catch {
                    errors.push(`Image download failed for SKU ${fp.sku}`);
                  }
                }

                const patch = buildProduct(fp, imageUrl);

                if (existingIdx >= 0) {
                  const curr = goods[existingIdx];
                  if (curr) {
                    goods[existingIdx] = {
                      ...curr,
                      ...patch,
                      id: curr.id,
                      category: curr.category,
                      sortPin: curr.sortPin,
                      relatedIds: curr.relatedIds,
                      visible: curr.visible,
                      updatedAt: new Date().toISOString(),
                    };
                    updated++;
                  }
                } else {
                  goods.push({ id: createId(), ...patch });
                  created++;
                }
              }),
            );

            const processed = Math.min(i + batchSize, total);
            const percent = Math.round((processed / total) * 100);

            emit({
              type: 'progress',
              current: processed,
              total,
              percent,
              created,
              updated,
              message: `Опрацьовано ${processed} із ${total}`,
            });

            // Small yield to let I/O and network flush
            await new Promise(r => setTimeout(r, 2));
          }

          emit({ type: 'status', message: 'Збереження каталогу…' });
          await saveSiteData({ ...siteData, goods });

          try {
            const { appendActivity } = await import('@/lib/admin-activity');
            const { getSessionClaims } = await import('@/lib/auth');
            const claims = await getSessionClaims();
            await appendActivity({
              kind: 'site_save',
              message: `Імпорт фіду: +${created} нових, ${updated} оновлено (${format.toUpperCase()})`,
              actor: claims?.username,
            });
          } catch {
            /* non-fatal */
          }

          emit({
            type: 'done',
            total,
            created,
            updated,
            failed: errors.length,
            message: `Імпорт успішно завершено! (+${created} нових, ${updated} оновлено)`,
          });
        } catch (fatalErr) {
          emit({
            type: 'error',
            error: `Непередбачена помилка: ${fatalErr instanceof Error ? fatalErr.message : String(fatalErr)}`,
          });
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
      },
    });
  }

  // Non-streaming fallback (e.g. unit tests or standard JSON POST)
  let rawText: string;
  try {
    rawText = await fetchFeed(url);
  } catch (err) {
    return NextResponse.json(
      { error: `Failed to fetch feed: ${err instanceof Error ? err.message : String(err)}` },
      { status: 502 },
    );
  }

  const format = detectFeedFormat(url, rawText);
  let feedProducts: FeedProduct[];
  try {
    if (format === 'xml') {
      feedProducts = parseLivestaXml(rawText);
    } else {
      const json = JSON.parse(rawText) as unknown;
      feedProducts = parseLivestaJson(json);
    }
  } catch (err) {
    return NextResponse.json(
      { error: `Failed to parse feed (${format}): ${err instanceof Error ? err.message : String(err)}` },
      { status: 422 },
    );
  }

  if (!feedProducts.length) {
    return NextResponse.json({ error: 'Feed contains no parseable products' }, { status: 422 });
  }

  const siteData = await getSiteData();
  const goods = [...siteData.goods];
  let created = 0;
  let updated = 0;
  const errors: string[] = [];

  for (const fp of feedProducts) {
    let imageUrl = fp.thumbUrl || PRODUCT_PLACEHOLDER_IMAGE;
    const existingIdx = fp.sku ? goods.findIndex(g => g.code === fp.sku) : -1;

    if (existingIdx >= 0 && goods[existingIdx]?.image?.startsWith('/uploads/')) {
      imageUrl = goods[existingIdx].image;
    } else if (downloadImages && fp.thumbUrl) {
      try {
        const stored = await fetchAndStoreImage(fp.thumbUrl, 'product');
        if (stored) imageUrl = stored;
      } catch {
        errors.push(`Image download failed for SKU ${fp.sku}`);
      }
    }

    const patch = buildProduct(fp, imageUrl);

    if (existingIdx >= 0) {
      const curr = goods[existingIdx];
      if (curr) {
        goods[existingIdx] = {
          ...curr,
          ...patch,
          id: curr.id,
          category: curr.category,
          sortPin: curr.sortPin,
          relatedIds: curr.relatedIds,
          visible: curr.visible,
          updatedAt: new Date().toISOString(),
        };
        updated++;
      }
    } else {
      goods.push({ id: createId(), ...patch });
      created++;
    }
  }

  try {
    await saveSiteData({ ...siteData, goods });
  } catch (err) {
    return NextResponse.json(
      { error: `Failed to save catalog: ${err instanceof Error ? err.message : String(err)}` },
      { status: 500 },
    );
  }

  try {
    const { appendActivity } = await import('@/lib/admin-activity');
    const { getSessionClaims } = await import('@/lib/auth');
    const claims = await getSessionClaims();
    await appendActivity({
      kind: 'site_save',
      message: `Імпорт фіду: +${created} нових, ${updated} оновлено (${format.toUpperCase()})`,
      actor: claims?.username,
    });
  } catch {
    /* non-fatal */
  }

  return NextResponse.json({ ok: true, created, updated, failed: errors.length, errors });
}
