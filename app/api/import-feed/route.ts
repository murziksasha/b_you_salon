import { NextRequest, NextResponse } from 'next/server';
import { requireAdminRole } from '@/lib/require-role';
import { clientKey, rateLimit } from '@/lib/rate-limit';
import {
  runFeedImport,
  isFeedImportRunning,
  FeedFetchError,
  FeedParseError,
  FeedImportConflictError,
} from '@/lib/run-feed-import';
import { stampManualSuccessIfNeeded } from '@/lib/feed-schedule';

export async function POST(request: NextRequest) {
  const g = await requireAdminRole('goods');
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

  if (isFeedImportRunning()) {
    return NextResponse.json(
      { error: 'Імпорт уже виконується. Зачекайте завершення або спробуйте пізніше.' },
      { status: 409 },
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
          const result = await runFeedImport({
            url,
            downloadImages,
            signal: request.signal,
            onStatus(message) {
              emit({ type: 'status', message });
            },
            onStart(total) {
              emit({ type: 'start', total, message: `Знайдено ${total} товарів` });
            },
            onProgress(p) {
              emit({
                type: 'progress',
                current: p.current,
                total: p.total,
                percent: p.percent,
                created: p.created,
                updated: p.updated,
                message: p.message,
              });
            },
          });

          if (result.aborted) {
            emit({ type: 'error', error: 'Імпорт скасовано' });
            return;
          }

          // Stamp manual success if schedule conditions met
          const now = new Date();
          await stampManualSuccessIfNeeded(now);

          try {
            const { appendActivity } = await import('@/lib/admin-activity');
            const { getSessionClaims } = await import('@/lib/auth');
            const claims = await getSessionClaims();
            await appendActivity({
              kind: 'site_save',
              message: `Імпорт фіду: +${result.created} нових, ${result.updated} оновлено (${result.format.toUpperCase()})`,
              actor: claims?.username,
            });
          } catch {
            /* non-fatal */
          }

          emit({
            type: 'done',
            total: result.total,
            created: result.created,
            updated: result.updated,
            failed: result.failed,
            message: `Імпорт успішно завершено! (+${result.created} нових, ${result.updated} оновлено)`,
          });
        } catch (fatalErr) {
          emit({
            type: 'error',
            error: fatalErr instanceof Error ? fatalErr.message : String(fatalErr),
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

  // Non-streaming fallback
  try {
    const result = await runFeedImport({
      url,
      downloadImages,
      signal: request.signal,
    });

    if (result.aborted) {
      return NextResponse.json({ error: 'Імпорт скасовано' }, { status: 400 });
    }

    const now = new Date();
    await stampManualSuccessIfNeeded(now);

    try {
      const { appendActivity } = await import('@/lib/admin-activity');
      const { getSessionClaims } = await import('@/lib/auth');
      const claims = await getSessionClaims();
      await appendActivity({
        kind: 'site_save',
        message: `Імпорт фіду: +${result.created} нових, ${result.updated} оновлено (${result.format.toUpperCase()})`,
        actor: claims?.username,
      });
    } catch {
      /* non-fatal */
    }

    return NextResponse.json({
      ok: true,
      created: result.created,
      updated: result.updated,
      failed: result.failed,
      errors: result.errors,
    });
  } catch (err) {
    if (err instanceof FeedImportConflictError) {
      return NextResponse.json({ error: err.message }, { status: 409 });
    }
    if (err instanceof FeedFetchError) {
      return NextResponse.json({ error: err.message }, { status: 502 });
    }
    if (err instanceof FeedParseError) {
      return NextResponse.json({ error: err.message }, { status: 422 });
    }
    return NextResponse.json(
      { error: `Failed to import feed: ${err instanceof Error ? err.message : String(err)}` },
      { status: 500 },
    );
  }
}
