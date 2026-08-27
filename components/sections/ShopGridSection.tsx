import Link from 'next/link';
import type { ShopGridSection as ShopGridSectionType, Product } from '@/lib/types';
import { ProductGrid } from '@/components/shop/ProductGrid';

export function ShopGridSection({
  section,
  products,
}: {
  section: ShopGridSectionType;
  products: Product[];
}) {
  return (
    <section className='shop-section wrapper' id='shop'>
      {section.title ? <h2 className='shop-section__title _title'>{section.title}</h2> : null}
      {section.subtitle ? <p className='shop-section__subtitle _paragr'>{section.subtitle}</p> : null}
      <ProductGrid products={products.slice(0, 8)} />
      {products.length > 8 ? (
        <p className='shop-section__more'>
          <Link href='/shop' className='_btn'>
            Усі товари
          </Link>
        </p>
      ) : null}
    </section>
  );
}
