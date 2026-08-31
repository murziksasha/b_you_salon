import Link from 'next/link';
import type { Product } from '@/lib/types';
import { PublicImage } from '@/components/ui/PublicImage';
import { AddToCartButton } from '@/components/cart/AddToCartButton';

const BADGE_LABELS: Record<string, string> = {
  hit: 'Хіт',
  sale: 'Акція',
  new: 'Новинка',
};

export function ProductCard({ product }: { product: Product }) {
  const badge = (product.badge || '').trim().toLowerCase();
  const badgeLabel = badge ? BADGE_LABELS[badge] || product.badge : '';
  const outOfStock = product.inStock === false;

  return (
    <article className={`shop-card${outOfStock ? ' shop-card--oos' : ''}`}>
      <Link href={`/shop/${product.id}`} className='shop-card__link'>
        <div className='shop-card__image'>
          <PublicImage
            src={product.image}
            alt={product.title}
            width={480}
            height={360}
            sizes='(max-width: 600px) 50vw, 320px'
          />
          {badgeLabel ? (
            <span className={`shop-card__badge shop-card__badge--${badge || 'custom'}`}>{badgeLabel}</span>
          ) : null}
          {outOfStock ? <span className='shop-card__oos'>Немає в наявності</span> : null}
        </div>
        <h3 className='shop-card__title'>{product.title}</h3>
        {product.promoText ? <p className='shop-card__promo'>{product.promoText}</p> : null}
        {product.code ? <p className='shop-card__code'>Код: {product.code}</p> : null}
        {product.description ? <p className='shop-card__desc'>{product.description}</p> : null}
      </Link>
      <div className='shop-card__footer'>
        <p className='shop-card__price'>{product.price.toLocaleString('uk-UA')} ₴</p>
        <AddToCartButton
          productId={product.id}
          disabled={outOfStock}
          className='by-btn shop-card__cart-btn'
        />
      </div>
    </article>
  );
}
