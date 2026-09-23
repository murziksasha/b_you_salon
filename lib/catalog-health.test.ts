import { describe, expect, it } from 'vitest';
import { productPublishIssues, scanCatalog } from './catalog-health';
import type { Product } from './types';
import { PRODUCT_PLACEHOLDER_IMAGE } from './media-usage';

function mockProduct(partial: Partial<Product>): Product {
  return {
    id: 'prod-1',
    title: 'Facial Cream',
    code: 'FC-01',
    category: 'Skincare',
    price: 450,
    image: '/uploads/cream.webp',
    visible: true,
    inStock: true,
    ...partial,
  };
}

describe('catalog-health', () => {
  describe('productPublishIssues', () => {
    it('returns empty array for a fully configured product', () => {
      const issues = productPublishIssues(mockProduct({}));
      expect(issues).toEqual([]);
    });

    it('detects missing or whitespace title', () => {
      expect(productPublishIssues(mockProduct({ title: '' }))).toContain('немає назви');
      expect(productPublishIssues(mockProduct({ title: '   ' }))).toContain('немає назви');
    });

    it('detects price <= 0 or invalid price', () => {
      expect(productPublishIssues(mockProduct({ price: 0 }))).toContain('ціна ≤ 0');
      expect(productPublishIssues(mockProduct({ price: -10 }))).toContain('ціна ≤ 0');
    });

    it('detects missing or placeholder main photo', () => {
      expect(productPublishIssues(mockProduct({ image: '' }))).toContain('немає головного фото');
      expect(productPublishIssues(mockProduct({ image: PRODUCT_PLACEHOLDER_IMAGE }))).toContain('немає головного фото');
      expect(productPublishIssues(mockProduct({ image: '/img/placeholder-cosmetics.svg' }))).toContain(
        'немає головного фото',
      );
    });

    it('detects missing code and category', () => {
      expect(productPublishIssues(mockProduct({ code: '' }))).toContain('немає коду');
      expect(productPublishIssues(mockProduct({ category: '  ' }))).toContain('немає категорії');
    });

    it('detects out of stock products', () => {
      expect(productPublishIssues(mockProduct({ inStock: false }))).toContain('немає в наявності');
    });
  });

  describe('scanCatalog', () => {
    it('summarizes issues, hidden products, and visible products without photo', () => {
      const products: Product[] = [
        mockProduct({ id: 'p1', visible: true }),
        mockProduct({ id: 'p2', visible: false }),
        mockProduct({ id: 'p3', visible: true, image: '' }),
        mockProduct({ id: 'p4', visible: true, price: 0, title: '' }),
      ];

      const result = scanCatalog(products);
      expect(result.hidden).toBe(1);
      expect(result.visibleWithoutPhoto).toBe(1);
      expect(result.issues).toHaveLength(2);
      expect(result.issues.find(i => i.productId === 'p3')?.issues).toContain('немає головного фото');
      expect(result.issues.find(i => i.productId === 'p4')?.issues).toEqual(
        expect.arrayContaining(['немає назви', 'ціна ≤ 0']),
      );
      expect(result.noOrdersHint).toBeTruthy();
    });
  });
});
