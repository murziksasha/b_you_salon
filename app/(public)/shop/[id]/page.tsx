import Link from 'next/link';
import { notFound } from 'next/navigation';
import { AddToCartButton } from '@/components/cart/AddToCartButton';
import { BreadcrumbJsonLd } from '@/components/seo/BreadcrumbJsonLd';
import { ProductJsonLd } from '@/components/seo/ProductJsonLd';
import { ProductCard } from '@/components/shop/ProductCard';
import { ProductGallery } from '@/components/shop/ProductGallery';
import { CharacteristicsTable } from '@/components/shop/CharacteristicsTable';
import { formatTelHref } from '@/lib/phone';
import { getRelatedProducts } from '@/lib/related-products';
import { requestSiteUrl } from '@/lib/request-site-url';
import { buildPublicMetadata, shareImageFromSettings } from '@/lib/seo-metadata';
import { getProduct, getProducts, getSiteData } from '@/lib/site-data';
import { sanitizeHtml } from '@/lib/sanitize';
import { stripHtmlToPlainText } from '@/lib/feed-import';

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
  const data = await getSiteData();
  const title = product.title;
  const description = stripHtmlToPlainText(product.description || product.title);
  const images = [product.image, ...(product.images || [])].filter(Boolean);
  return buildPublicMetadata(
    {
      title,
      description,
      path: `/shop/${product.id}`,
      image: images.length ? images : shareImageFromSettings(data.settings),
    },
    await requestSiteUrl(),
  );
}

export default async function ProductDetailPage({ params }: PageProps) {
  const { id } = await params;
  const product = await getProduct(id);
  if (!product || !product.visible) {
    notFound();
  }

  const [data, allProducts, siteUrl] = await Promise.all([getSiteData(), getProducts(), requestSiteUrl()]);

  const related = getRelatedProducts(allProducts, product, 4);
  const galleryImages = [product.image, ...(product.images || [])].filter(Boolean);

  return (
    <article className='by-page shop-detail'>
      <ProductJsonLd product={product} siteUrl={siteUrl} />
      <BreadcrumbJsonLd
        siteUrl={siteUrl}
        items={[
          { name: 'Головна', path: '/' },
          { name: 'Магазин', path: '/shop' },
          { name: product.title, path: `/shop/${product.id}` },
        ]}
      />
      <div className='by-container'>
        <Link href='/shop' className='shop-detail__back'>
          ← Усі товари
        </Link>
        <div className='shop-detail__grid'>
          <ProductGallery images={galleryImages} alt={product.title} />
          <div className='shop-detail__info'>
            <div className='shop-detail__badges'>
              {product.badge ? (
                <span className={`shop-card__badge shop-card__badge--${product.badge.toLowerCase()}`}>
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
            {product.description ? (
              <div
                className='shop-detail__desc'
                dangerouslySetInnerHTML={{ __html: sanitizeHtml(product.description) }}
              />
            ) : null}
            {product.characteristics ? <CharacteristicsTable raw={product.characteristics} /> : null}
            {product.video ? (
              <div className='shop-detail__video'>
                <h2 className='shop-detail__video-title'>Огляд</h2>
                <video className='shop-detail__video-el' src={product.video} controls playsInline preload='metadata' />
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
              {related.map(p => (
                <ProductCard key={p.id} product={p} />
              ))}
            </div>
          </section>
        ) : null}
      </div>
    </article>
  );
}
