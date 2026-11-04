import type { Product } from '@/lib/types';
import type { ProductCardDTO } from '@/lib/shop-catalog';
import { ProductCard } from './ProductCard';

export function ProductGrid({ products }: { products: (Product | ProductCardDTO)[] }) {
  if (!products.length) {
    return <p className="shop-empty _paragr">Товари скоро з&apos;являться. Звертайтесь за телефоном.</p>;
  }

  return (
    <div className="shop-grid">
      {products.map((product) => (
        <ProductCard key={product.id} product={product} />
      ))}
    </div>
  );
}
