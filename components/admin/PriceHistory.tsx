'use client';

import { useEffect, useState } from 'react';

type Point = { at: string; price: number; title?: string };

export function PriceHistory({ productId }: { productId: string }) {
  const [entries, setEntries] = useState<Point[]>([]);

  useEffect(() => {
    if (!productId) return;
    void (async () => {
      try {
        const res = await fetch(`/api/prices?productId=${encodeURIComponent(productId)}&limit=12`);
        if (!res.ok) return;
        const json = (await res.json()) as { entries?: Point[] };
        setEntries(json.entries || []);
      } catch {
        /* ignore */
      }
    })();
  }, [productId]);

  if (!entries.length) {
    return <p className='admin-hint'>Історія цін: поки порожньо (зʼявиться після зміни ціни).</p>;
  }

  return (
    <div className='admin-mb'>
      <h3 className='admin-h3'>Історія цін</h3>
      <ul className='admin-checklist'>
        {entries.map((e, i) => (
          <li key={`${e.at}-${i}`}>
            {new Date(e.at).toLocaleString('uk-UA')}: <strong>{e.price.toLocaleString('uk-UA')} ₴</strong>
          </li>
        ))}
      </ul>
    </div>
  );
}
