import { describe, expect, it } from 'vitest';
import { addLine, availableCartItems, cartTotal, clampQty, hydrateCart, parseCartLines } from './cart';
import type { Product } from './types';

const products: Product[] = [
  { id: 'a', title: 'A', description: '', price: 100, image: '/a.jpg', visible: true, inStock: true },
  { id: 'b', title: 'B', description: '', price: 50, image: '/b.jpg', visible: true, inStock: false },
  { id: 'c', title: 'C', description: '', price: 10, image: '/c.jpg', visible: false },
];

describe('cart', () => {
  it('clamps qty', () => {
    expect(clampQty(0)).toBe(1);
    expect(clampQty(200)).toBe(99);
    expect(clampQty(2.9)).toBe(2);
  });

  it('parses and merges lines', () => {
    const lines = parseCartLines([{ id: 'a', qty: 2 }, { id: 'a', qty: 9 }, { id: '', qty: 1 }]);
    expect(lines).toEqual([{ id: 'a', qty: 2 }]);
    expect(addLine(lines, 'a', 3)[0].qty).toBe(5);
  });

  it('hydrates and drops unavailable', () => {
    const hydrated = hydrateCart(
      [
        { id: 'a', qty: 2 },
        { id: 'b', qty: 1 },
        { id: 'c', qty: 1 },
        { id: 'missing', qty: 1 },
      ],
      products,
    );
    const items = availableCartItems(hydrated);
    expect(items).toEqual([{ id: 'a', title: 'A', price: 100, qty: 2, code: undefined, image: '/a.jpg' }]);
    expect(cartTotal(items)).toBe(200);
    expect(hydrated.find((h) => h.id === 'b')?.reason).toBe('oos');
    expect(hydrated.find((h) => h.id === 'c')?.reason).toBe('hidden');
  });
});
