import type { Product } from '@/lib/types';

interface ProductJsonLdProps {
  product: Product;
  siteUrl?: string;
}

export function ProductJsonLd({ product, siteUrl }: ProductJsonLdProps) {
  const image = product.image
    ? siteUrl
      ? new URL(product.image, siteUrl).toString()
      : product.image
    : undefined;
  const url = siteUrl ? `${siteUrl.replace(/\/$/, '')}/shop/${product.id}` : undefined;

  const data: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: product.title,
    description: product.description,
    image,
    sku: product.code || undefined,
    offers: {
      '@type': 'Offer',
      price: product.price,
      priceCurrency: 'UAH',
      availability:
        product.inStock === false
          ? 'https://schema.org/OutOfStock'
          : 'https://schema.org/InStock',
      url,
    },
  };

  const clean = JSON.parse(JSON.stringify(data)) as Record<string, unknown>;

  return (
    <script type='application/ld+json' dangerouslySetInnerHTML={{ __html: JSON.stringify(clean) }} />
  );
}
