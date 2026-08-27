import Link from 'next/link';

export const dynamic = 'force-dynamic';

export default async function ThanksPage({
  searchParams,
}: {
  searchParams: Promise<{ kind?: string }>;
}) {
  const sp = await searchParams;
  const order = sp.kind === 'order';
  return (
    <section className='by-section'>
      <div className='by-wrap'>
        <h1 className='by-section__title'>Дякуємо</h1>
        <p className='by-section__sub'>
          {order
            ? 'Заявку на замовлення отримано. Менеджер підтвердить наявність і спосіб отримання.'
            : 'Заявку отримано. Скоро зателефонуємо, щоб узгодити час.'}
        </p>
        <p>
          <Link className='by-btn' href={order ? '/shop' : '/salon'}>
            {order ? 'До магазину' : 'До салону'}
          </Link>
        </p>
      </div>
    </section>
  );
}
