'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import {
  CART_STORAGE_KEY,
  addLine,
  cartCount,
  mergeLine,
  parseCartLines,
  removeLine,
  type CartLine,
} from '@/lib/cart';

type CartContextValue = {
  lines: CartLine[];
  count: number;
  add: (id: string, qty?: number) => void;
  setQty: (id: string, qty: number) => void;
  remove: (id: string) => void;
  clear: () => void;
};

const CartContext = createContext<CartContextValue | null>(null);

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [lines, setLines] = useState<CartLine[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(CART_STORAGE_KEY);
      setLines(parseCartLines(raw ? JSON.parse(raw) : []));
    } catch {
      setLines([]);
    }
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(lines));
  }, [lines, ready]);

  const add = useCallback((id: string, qty = 1) => {
    setLines((prev) => addLine(prev, id, qty));
  }, []);
  const setQty = useCallback((id: string, qty: number) => {
    setLines((prev) => mergeLine(prev, id, qty));
  }, []);
  const remove = useCallback((id: string) => {
    setLines((prev) => removeLine(prev, id));
  }, []);
  const clear = useCallback(() => setLines([]), []);

  const value = useMemo(
    () => ({ lines, count: cartCount(lines), add, setQty, remove, clear }),
    [lines, add, setQty, remove, clear],
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart must be used within CartProvider');
  return ctx;
}
