import { describe, expect, it } from 'vitest';
import { getRelatedProducts } from './related-products';
import type { Product } from './types';

function createProduct(id: string, category: string, visible = true, relatedIds?: string[]): Product {
  return {
    id,
    title: `Product ${id}`,
    description: '',
    image: '/img/placeholder.webp',
    category,
    price: 100,
    visible,
    relatedIds,
  };
}

describe('related-products', () => {
  const current = createProduct('curr', 'Hair', true, ['rel-1', 'rel-hidden', 'curr']);

  const catalog: Product[] = [
    current,
    createProduct('rel-1', 'Body', true),
    createProduct('rel-hidden', 'Hair', false),
    createProduct('hair-1', 'Hair', true),
    createProduct('hair-2', 'hair', true), // case-insensitive check
    createProduct('face-1', 'Face', true),
    createProduct('face-2', 'Face', true),
  ];

  it('prioritizes explicit relatedIds, then same category, then other visible products', () => {
    const related = getRelatedProducts(catalog, current, 4);

    expect(related.map(p => p.id)).toEqual(['rel-1', 'hair-1', 'hair-2', 'face-1']);
  });

  it('respects limit parameter and ignores self and hidden products', () => {
    const related = getRelatedProducts(catalog, current, 2);
    expect(related).toHaveLength(2);
    expect(related.map(p => p.id)).toEqual(['rel-1', 'hair-1']);
  });

  it('falls back to others if category is empty or undefined', () => {
    const noCatCurrent = createProduct('no-cat', '', true);
    const related = getRelatedProducts(catalog, noCatCurrent, 3);
    expect(related).toHaveLength(3);
    expect(related.map(p => p.id)).not.toContain('no-cat');
  });

  it('returns empty array when no other visible products exist', () => {
    const solo = [current];
    expect(getRelatedProducts(solo, current)).toEqual([]);
  });
});
