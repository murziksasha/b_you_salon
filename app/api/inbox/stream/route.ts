import { NextRequest } from 'next/server';
import { listLeads } from '@/lib/leads';
import { listOrders } from '@/lib/orders';
import { mergeInbox } from '@/lib/inbox';
import { requireAdminRole } from '@/lib/require-role';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * Server-Sent Events: inbox open counts + latest open item id.
 * Polls JSON stores every 3s; emits only on change.
 */
export async function GET(request: NextRequest) {
  const g = await requireAdminRole('inbox');
  if (!g.ok) return g.response;

  const encoder = new TextEncoder();
  let closed = false;

  const stream = new ReadableStream({
    start(controller) {
      let lastSig = '';

      const send = (payload: unknown) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
        } catch {
          closed = true;
        }
      };

      const tick = async () => {
        if (closed) return;
        try {
          const [leads, orders] = await Promise.all([listLeads(), listOrders()]);
          const items = mergeInbox(leads, orders);
          const open = items.filter((i) => i.open);
          const latest = open[0];
          const sig = [
            open.length,
            open.filter((i) => i.kind === 'lead').length,
            open.filter((i) => i.kind === 'order').length,
            open.filter((i) => i.stale).length,
            latest?.id || '',
            latest?.status || '',
            items[0]?.id || '',
            items[0]?.status || '',
          ].join('|');

          if (sig === lastSig) return;
          lastSig = sig;

          send({
            openTotal: open.length,
            openLeads: open.filter((i) => i.kind === 'lead').length,
            openOrders: open.filter((i) => i.kind === 'order').length,
            stale: open.filter((i) => i.stale).length,
            latestId: latest?.id || null,
            latestKind: latest?.kind || null,
            latestPhone: latest?.phone || null,
            at: new Date().toISOString(),
          });
        } catch {
          /* ignore tick errors */
        }
      };

      void tick();
      const interval = setInterval(() => void tick(), 3000);

      // heartbeat keeps proxies from closing idle streams
      const heartbeat = setInterval(() => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`: ping\n\n`));
        } catch {
          closed = true;
        }
      }, 15000);

      const cleanup = () => {
        if (closed) return;
        closed = true;
        clearInterval(interval);
        clearInterval(heartbeat);
        try {
          controller.close();
        } catch {
          /* ignore */
        }
      };

      request.signal.addEventListener('abort', cleanup);
    },
    cancel() {
      closed = true;
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
