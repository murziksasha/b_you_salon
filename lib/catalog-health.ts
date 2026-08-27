import type { Product } from './types';
import { PRODUCT_PLACEHOLDER_IMAGE } from './media-usage';

export type CatalogIssue = {
  productId: string;
  title: string;
  issues: string[];
};

export function productPublishIssues(p: Product): string[] {
  const issues: string[] = [];
  if (!p.title?.trim()) issues.push('немає назви');
  if (!(p.price > 0)) issues.push('ціна ≤ 0');
  if (!p.image || p.image === PRODUCT_PLACEHOLDER_IMAGE || p.image.includes('placeholder')) {
    issues.push('немає головного фото');
  }
  if (!(p.code || '').trim()) issues.push('немає коду');
  if (!(p.category || '').trim()) issues.push('немає категорії');
  if (p.inStock === false) issues.push('немає в наявності');
  return issues;
}

export function scanCatalog(products: Product[]): {
  issues: CatalogIssue[];
  noOrdersHint: string;
  visibleWithoutPhoto: number;
  hidden: number;
} {
  const issues: CatalogIssue[] = [];
  let visibleWithoutPhoto = 0;
  let hidden = 0;
  for (const p of products) {
    if (!p.visible) {
      hidden++;
      continue;
    }
    const list = productPublishIssues(p);
    if (list.some((i) => i.includes('фото'))) visibleWithoutPhoto++;
    if (list.length) issues.push({ productId: p.id, title: p.title, issues: list });
  }
  return {
    issues,
    noOrdersHint: 'Замовлення див. у /admin/orders (топи на Dashboard)',
    visibleWithoutPhoto,
    hidden,
  };
}
