'use client';

import Link from 'next/link';
import { FormEvent, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Product } from '@/lib/types';
import { MAX_QTY, availableCartItems, cartTotal, hydrateCart } from '@/lib/cart';
import { isValidUaPhone, PHONE_PLACEHOLDER } from '@/lib/phone';
import { PhoneInput } from '@/components/forms/PhoneInput';
import { useCart } from './CartProvider';

export function CartCheckout({
  products,
  pickupHint,
}: {
  products: Product[];
  pickupHint?: string;
}) {
  const { lines, setQty, remove, clear } = useCart();
  const hydrated = useMemo(() => hydrateCart(lines, products), [lines, products]);
  const items = availableCartItems(hydrated);
  const total = cartTotal(items);
  const router = useRouter();
  const [fulfillment, setFulfillment] = useState<'pickup' | 'delivery'>('pickup');
  const [status, setStatus] = useState('');
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    const phone = String(fd.get('phone') || '');
    if (!isValidUaPhone(phone)) {
      setError(true);
      setStatus('Введіть коректний номер телефону');
      return;
    }
    if (fulfillment === 'delivery' && String(fd.get('address') || '').trim().length < 5) {
      setError(true);
      setStatus('Вкажіть адресу доставки');
      return;
    }
    if (!items.length) {
      setError(true);
      setStatus('Кошик порожній або товари недоступні');
      return;
    }
    setLoading(true);
    setError(false);
    try {
      const res = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone,
          name: String(fd.get('name') || ''),
          comment: String(fd.get('comment') || ''),
          fulfillment,
          address: String(fd.get('address') || ''),
          website: String(fd.get('website') || ''),
          items: items.map((i) => ({ id: i.id, qty: i.qty })),
        }),
      });
      if (!res.ok) {
        setError(true);
        setStatus(res.status === 429 ? 'Забагато запитів. Зачекайте хвилину.' : 'Не вдалося надіслати заявку');
        return;
      }
      clear();
      router.push('/thanks?kind=order');
    } catch {
      setError(true);
      setStatus('Не вдалося надіслати заявку');
    } finally {
      setLoading(false);
    }
  }

  if (!lines.length) {
    return (
      <div className='cart-empty'>
        <p className='cart-empty__text'>Кошик порожній</p>
        <p className='cart-empty__hint'>Оберіть товари в каталозі магазину — і оформіть заявку менеджеру.</p>
        <Link href='/shop' className='by-btn'>
          До каталогу
        </Link>
      </div>
    );
  }

  return (
    <div className='cart-layout'>
      <div className='cart-lines'>
        <div className='cart-table'>
          {hydrated.map((row) => {
            const unit = row.product?.price || 0;
            const lineTotal = unit * row.qty;
            return (
              <div className='cart-row' key={row.id}>
                <div className='cart-row__media'>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={row.product?.image || '/img/shop/serum.jpg'} alt={row.product?.title || ''} />
                </div>
                <div className='cart-row__info'>
                  {row.product ? (
                    <Link href={`/shop/${row.id}`} className='cart-row__title'>
                      {row.product.title}
                    </Link>
                  ) : (
                    <strong className='cart-row__title'>Товар недоступний</strong>
                  )}
                  {!row.available ? (
                    <p className='cart-row__warn'>
                      {row.reason === 'oos' ? 'Немає в наявності' : 'Більше не продається'}
                    </p>
                  ) : (
                    <p className='cart-row__unit'>{unit.toLocaleString('uk-UA')} ₴ / шт</p>
                  )}
                </div>
                <div className='cart-row__controls'>
                  {row.available ? (
                    <div className='cart-qty' role='group' aria-label={`Кількість: ${row.product?.title || ''}`}>
                      <button
                        type='button'
                        className='cart-qty__btn'
                        aria-label='Зменшити кількість'
                        disabled={row.qty <= 1}
                        onClick={() => setQty(row.id, row.qty - 1)}
                      >
                        −
                      </button>
                      <input
                        className='cart-qty__input'
                        type='number'
                        min={1}
                        max={MAX_QTY}
                        value={row.qty}
                        aria-label='Кількість'
                        onChange={(e) => setQty(row.id, Number(e.target.value))}
                      />
                      <button
                        type='button'
                        className='cart-qty__btn'
                        aria-label='Збільшити кількість'
                        disabled={row.qty >= MAX_QTY}
                        onClick={() => setQty(row.id, row.qty + 1)}
                      >
                        +
                      </button>
                    </div>
                  ) : (
                    <span />
                  )}
                  {row.available ? (
                    <p className='cart-row__line-total'>{lineTotal.toLocaleString('uk-UA')} ₴</p>
                  ) : null}
                  <button
                    type='button'
                    className='by-btn by-btn--ghost cart-row__remove'
                    onClick={() => remove(row.id)}
                  >
                    Прибрати
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        <p className='cart-summary'>
          <span>Разом</span>
          <strong className='cart-summary__total'>{total.toLocaleString('uk-UA')} ₴</strong>
        </p>
      </div>

      <aside className='cart-panel' aria-labelledby='cart-panel-title'>
        <h2 id='cart-panel-title' className='cart-panel__title'>
          Звʼязатися з менеджером
        </h2>
        <p className='cart-panel__hint'>
          Заявка без онлайн-оплати. Самовивіз у магазині ліворуч або доставка за домовленістю.
        </p>
        <form className='by-form' onSubmit={onSubmit}>
          <label className='cart-field'>
            <span className='cart-field__label'>
              Імʼя <span className='cart-field__optional'>(необовʼязково)</span>
            </span>
            <input name='name' placeholder='Як до вас звертатися' autoComplete='name' />
          </label>

          <label className='cart-field'>
            <span className='cart-field__label'>Телефон</span>
            <PhoneInput name='phone' placeholder={PHONE_PLACEHOLDER} required />
          </label>

          <fieldset className='cart-fulfillment'>
            <legend className='cart-field__label'>Спосіб отримання</legend>
            <label className={`cart-fulfillment__option${fulfillment === 'pickup' ? ' is-active' : ''}`}>
              <input
                type='radio'
                name='fulfillment'
                value='pickup'
                checked={fulfillment === 'pickup'}
                onChange={() => setFulfillment('pickup')}
              />
              <span>
                Самовивіз у B_You
                {pickupHint ? ` — ${pickupHint}` : ''}
              </span>
            </label>
            <label className={`cart-fulfillment__option${fulfillment === 'delivery' ? ' is-active' : ''}`}>
              <input
                type='radio'
                name='fulfillment'
                value='delivery'
                checked={fulfillment === 'delivery'}
                onChange={() => setFulfillment('delivery')}
              />
              <span>Потрібна доставка</span>
            </label>
          </fieldset>

          {fulfillment === 'delivery' ? (
            <label className='cart-field'>
              <span className='cart-field__label'>Адреса доставки</span>
              <textarea name='address' rows={2} placeholder='Місто, вулиця, будинок, підʼїзд' required />
            </label>
          ) : null}

          <label className='cart-field'>
            <span className='cart-field__label'>
              Коментар <span className='cart-field__optional'>(відтінок, обʼєм)</span>
            </span>
            <textarea name='comment' rows={3} placeholder='Побажання до замовлення' />
          </label>

          <div className='form-hp' aria-hidden='true'>
            <input type='text' name='website' tabIndex={-1} autoComplete='off' />
          </div>

          <button className='by-btn cart-panel__submit' type='submit' disabled={loading || !items.length}>
            {loading ? 'Надсилаємо…' : 'Оформити заявку'}
          </button>
          {status ? <p className={`status${error ? ' status--error' : ''}`}>{status}</p> : null}
        </form>
      </aside>
    </div>
  );
}
