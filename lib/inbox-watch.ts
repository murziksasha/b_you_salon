import { watch, type FSWatcher } from 'fs';
import path from 'path';
import { mergeInbox } from './inbox';
import { leadsFilePath, listLeads } from './leads';
import { listOrders, ordersFilePath } from './orders';

export type InboxStreamPayload = {
  openTotal: number;
  openLeads: number;
  openOrders: number;
  stale: number;
  latestId: string | null;
  latestKind: string | null;
  latestPhone: string | null;
  at: string;
};

type Cache = { sig: string; payload: InboxStreamPayload };

type WatchState = {
  dir: string;
  watcher: FSWatcher | null;
  poll: ReturnType<typeof setInterval> | null;
  debounce: ReturnType<typeof setTimeout> | null;
  cache: Cache | null;
  listeners: Set<(payload: InboxStreamPayload) => void>;
};

const g = globalThis as { __byouInboxWatch?: WatchState };

function state(): WatchState {
  if (!g.__byouInboxWatch) {
    g.__byouInboxWatch = {
      dir: '',
      watcher: null,
      poll: null,
      debounce: null,
      cache: null,
      listeners: new Set(),
    };
  }
  return g.__byouInboxWatch;
}

function dataDir(): string {
  return path.dirname(leadsFilePath());
}

function relevantFile(name: string | Buffer | null): boolean {
  if (!name) return false;
  const base = String(name);
  return (
    base === path.basename(leadsFilePath()) ||
    base === path.basename(ordersFilePath()) ||
    base.startsWith('.leads.json.') ||
    base.startsWith('.orders.json.')
  );
}

async function computePayload(): Promise<Cache> {
  const [leads, orders] = await Promise.all([listLeads(), listOrders()]);
  const items = mergeInbox(leads, orders);
  const open = items.filter(i => i.open);
  const latest = open[0];
  const payload: InboxStreamPayload = {
    openTotal: open.length,
    openLeads: open.filter(i => i.kind === 'lead').length,
    openOrders: open.filter(i => i.kind === 'order').length,
    stale: open.filter(i => i.stale).length,
    latestId: latest?.id || null,
    latestKind: latest?.kind || null,
    latestPhone: latest?.phone || null,
    at: new Date().toISOString(),
  };
  const sig = [
    payload.openTotal,
    payload.openLeads,
    payload.openOrders,
    payload.stale,
    payload.latestId || '',
    latest?.status || '',
    items[0]?.id || '',
    items[0]?.status || '',
  ].join('|');
  return { sig, payload };
}

async function refresh(forceEmit = false): Promise<InboxStreamPayload> {
  const s = state();
  const next = await computePayload();
  const changed = !s.cache || s.cache.sig !== next.sig;
  s.cache = next;
  if (changed || forceEmit) {
    for (const fn of s.listeners) {
      try {
        fn(next.payload);
      } catch {
        /* ignore listener errors */
      }
    }
  }
  return next.payload;
}

function scheduleRefresh(): void {
  const s = state();
  if (s.debounce) clearTimeout(s.debounce);
  s.debounce = setTimeout(() => {
    s.debounce = null;
    void refresh();
  }, 120);
}

function startWatchers(): void {
  const s = state();
  const dir = dataDir();
  if (s.watcher && s.dir === dir) return;
  stopWatchers();
  s.dir = dir;

  try {
    s.watcher = watch(dir, { persistent: false }, (_event, filename) => {
      if (!relevantFile(filename)) return;
      scheduleRefresh();
    });
    s.watcher.on('error', () => {
      s.watcher = null;
    });
  } catch (err) {
    console.error('[inbox-watch] fs.watch failed, using poll fallback', err);
    s.watcher = null;
  }

  // Safety poll: Windows rename events can be missed; cheap because JSON is cached in OS.
  s.poll = setInterval(() => void refresh(), s.watcher ? 15_000 : 3_000);
  s.poll.unref?.();
}

function stopWatchers(): void {
  const s = state();
  if (s.watcher) {
    try {
      s.watcher.close();
    } catch {
      /* ignore */
    }
    s.watcher = null;
  }
  if (s.poll) {
    clearInterval(s.poll);
    s.poll = null;
  }
  if (s.debounce) {
    clearTimeout(s.debounce);
    s.debounce = null;
  }
  s.dir = '';
}

export async function getInboxStreamPayload(): Promise<InboxStreamPayload> {
  const s = state();
  if (s.cache) return s.cache.payload;
  return refresh();
}

export function subscribeInboxStream(listener: (payload: InboxStreamPayload) => void): () => void {
  const s = state();
  s.listeners.add(listener);
  startWatchers();
  void refresh();
  return () => {
    s.listeners.delete(listener);
    if (s.listeners.size === 0) {
      stopWatchers();
    }
  };
}

export function stopInboxWatch(): void {
  const s = state();
  s.listeners.clear();
  s.cache = null;
  stopWatchers();
}
