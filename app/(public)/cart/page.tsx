import Link from 'next/link';
import { CartCheckout } from '@/components/cart/CartCheckout';
import { getProducts, getSiteData } from '@/lib/site-data';

export const dynamic = 'force-dynamic';

export async function generateMetadata() {
  return { title: 'Кошик' };
}

export default async function CartPage() {
  const [products, data] = await Promise.all([getProducts(), getSiteData()]);
  return (
    <section className='by-section cart-page'>
      <div className='by-wrap'>
        <Link href='/shop' className='cart-page__back'>
          ← До магазину
        </Link>
        <h1 className='by-section__title'>Кошик</h1>
        <p className='by-section__sub'>
          Перевірте товари й надішліть заявку менеджеру. Самовивіз у магазині ліворуч або доставка за
          домовленістю.
        </p>
        <CartCheckout products={products} pickupHint={data.settings.addressNote} />
      </div>
    </section>
  );
}
