'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import {
  readNotifyPrefs,
  shouldNotify,
  type NotifyPrefs,
} from '@/lib/admin-notify-prefs';

type Counts = {
  openLeads: number;
  openOrders: number;
  openTotal: number;
  stale: number;
  latestId?: string | null;
  latestKind?: string | null;
};

type Ctx = Counts & {
  refresh: () => Promise<void>;
  loading: boolean;
  live: boolean;
};

const AdminCountsContext = createContext<Ctx | null>(null);

const EMPTY: Counts = { openLeads: 0, openOrders: 0, openTotal: 0, stale: 0 };

export function AdminCountsProvider({ children }: { children: React.ReactNode }) {
  const [counts, setCounts] = useState<Counts>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [live, setLive] = useState(false);
  const esRef = useRef<EventSource | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/api/inbox');
      if (!res.ok) return;
      const json = (await res.json()) as {
        openLeads?: number;
        openOrders?: number;
        open?: number;
        stale?: number;
      };
      setCounts((prev) => ({
        ...prev,
        openLeads: json.openLeads || 0,
        openOrders: json.openOrders || 0,
        openTotal: json.open || 0,
        stale: json.stale || 0,
      }));
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, []);

  // Prefer SSE; fall back to polling if EventSource fails
  useEffect(() => {
    let pollId: number | null = null;
    let cancelled = false;

    function startPoll() {
      setLive(false);
      void refresh();
      pollId = window.setInterval(() => void refresh(), 20_000);
    }

    try {
      const es = new EventSource('/api/inbox/stream');
      esRef.current = es;

      es.onopen = () => {
        if (!cancelled) setLive(true);
      };

      es.onmessage = (ev) => {
        try {
          const json = JSON.parse(ev.data) as Counts;
          setCounts({
            openLeads: json.openLeads || 0,
            openOrders: json.openOrders || 0,
            openTotal: json.openTotal || 0,
            stale: json.stale || 0,
            latestId: json.latestId,
            latestKind: json.latestKind,
          });
          setLoading(false);
          setLive(true);
        } catch {
          /* ignore parse */
        }
      };

      es.onerror = () => {
        es.close();
        esRef.current = null;
        if (!cancelled) startPoll();
      };
    } catch {
      startPoll();
    }

    return () => {
      cancelled = true;
      esRef.current?.close();
      esRef.current = null;
      if (pollId) window.clearInterval(pollId);
    };
  }, [refresh]);

  // Title badge + desktop notifications (respect prefs)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const prefs: NotifyPrefs = readNotifyPrefs();
    const base = 'Admin | B_You';
    if (prefs.titleBadge && counts.openTotal > 0) {
      document.title = `(${counts.openTotal}) ${base}`;
    } else {
      document.title = base;
    }

    const key = 'admin-last-open-total';
    let prev = 0;
    try {
      prev = Number(sessionStorage.getItem(key) || '0') || 0;
    } catch {
      prev = 0;
    }
    const grew = counts.openTotal > prev && prev > 0;
    if (
      grew &&
      shouldNotify(prefs, counts.latestKind) &&
      typeof Notification !== 'undefined' &&
      Notification.permission === 'granted'
    ) {
      try {
        new Notification('B_You', {
          body: `Нові звернення: ${counts.openTotal} відкритих`,
          tag: 'byou-inbox',
        });
        if (prefs.sound) {
          try {
            const ctx = new AudioContext();
            const o = ctx.createOscillator();
            const g = ctx.createGain();
            o.connect(g);
            g.connect(ctx.destination);
            o.frequency.value = 880;
            g.gain.value = 0.03;
            o.start();
            o.stop(ctx.currentTime + 0.12);
          } catch {
            /* ignore audio */
          }
        }
      } catch {
        /* ignore */
      }
    }
    try {
      sessionStorage.setItem(key, String(counts.openTotal));
    } catch {
      /* ignore */
    }
  }, [counts.openTotal, counts.latestKind]);

  const value = useMemo(
    () => ({ ...counts, refresh, loading, live }),
    [counts, refresh, loading, live],
  );

  return <AdminCountsContext.Provider value={value}>{children}</AdminCountsContext.Provider>;
}

export function useAdminCounts(): Ctx {
  const ctx = useContext(AdminCountsContext);
  if (!ctx) {
    return { ...EMPTY, refresh: async () => {}, loading: false, live: false };
  }
  return ctx;
}

export async function requestNotifyPermission(): Promise<void> {
  if (typeof window === 'undefined' || !('Notification' in window)) return;
  if (Notification.permission === 'default') {
    try {
      await Notification.requestPermission();
    } catch {
      /* ignore */
    }
  }
}
