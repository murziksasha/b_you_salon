import Link from 'next/link';
import { notFound } from 'next/navigation';
import { AddToCartButton } from '@/components/cart/AddToCartButton';
import { ProductCard } from '@/components/shop/ProductCard';
import { ProductGallery } from '@/components/shop/ProductGallery';
import { formatTelHref } from '@/lib/phone';
import { getRelatedProducts } from '@/lib/related-products';
import { getProduct, getProducts, getSiteData } from '@/lib/site-data';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: PageProps) {
  const { id } = await params;
  const product = await getProduct(id);
  if (!product || !product.visible) {
    return { title: 'Товар не знайдено' };
  }
  const title = product.title;
  const description = product.description || product.title;
  const images = [product.image, ...(product.images || [])].filter(Boolean);
  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: 'website',
      images: images.slice(0, 4).map((url) => ({ url })),
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
    },
  };
}

export default async function ProductPage({ params }: PageProps) {
  const { id } = await params;
  const [data, product, allProducts] = await Promise.all([
    getSiteData(),
    getProduct(id),
    getProducts(),
  ]);

  if (!product || !product.visible) {
    notFound();
  }

  const gallery = [product.image, ...(product.images || []).filter((u) => u && u !== product.image)];
  const related = getRelatedProducts(allProducts, product, 4);

  return (
    <article className='shop-detail wrapper'>
      <Link href='/shop' className='shop-detail__back'>
        ← Усі товари
      </Link>
      <div className='shop-detail__grid'>
        <ProductGallery images={gallery} alt={product.title} />
        <div className='shop-detail__info'>
          <div className='shop-detail__badges'>
            {product.badge ? (
              <span className={`shop-card__badge shop-card__badge--${String(product.badge).toLowerCase()}`}>
                {product.badge === 'hit'
                  ? 'Хіт'
                  : product.badge === 'sale'
                    ? 'Акція'
                    : product.badge === 'new'
                      ? 'Новинка'
                      : product.badge}
              </span>
            ) : null}
            {product.inStock === false ? (
              <span className='shop-card__oos shop-card__oos--inline'>Немає в наявності</span>
            ) : null}
          </div>
          <h1 className='shop-detail__title'>{product.title}</h1>
          {product.promoText ? <p className='shop-detail__promo'>{product.promoText}</p> : null}
          {product.code ? <p className='shop-detail__code'>Код: {product.code}</p> : null}
          <p className='shop-detail__price'>{product.price.toLocaleString('uk-UA')} ₴</p>
          <p className='shop-detail__desc'>{product.description}</p>
          {product.video ? (
            <div className='shop-detail__video'>
              <h2 className='shop-detail__video-title'>Огляд</h2>
              <video
                className='shop-detail__video-el'
                src={product.video}
                controls
                playsInline
                preload='metadata'
              />
            </div>
          ) : null}
          <div className='shop-detail__actions'>
            <AddToCartButton productId={product.id} disabled={product.inStock === false} />
            <a
              href={formatTelHref((data.settings.shopPhone || data.settings.headerPhone).tel)}
              className='by-btn by-btn--ghost'
            >
              Зателефонувати
            </a>
          </div>
          <p className='by-section__sub'>Відтінок або об’єм вкажіть у коментарі до замовлення в кошику.</p>
        </div>
      </div>

      {related.length > 0 ? (
        <section className='shop-related' aria-label='Схожі товари'>
          <h2 className='shop-related__title by-section__title'>Схожі товари</h2>
          <div className='shop-grid'>
            {related.map((p) => (
              <ProductCard key={p.id} product={p} />
            ))}
          </div>
        </section>
      ) : null}
    </article>
  );
}
