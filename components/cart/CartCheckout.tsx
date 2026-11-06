'use client';

import Link from 'next/link';
import { type FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Product } from '@/lib/types';
import type { ProductCardDTO } from '@/lib/shop-catalog';
import { MAX_QTY, availableCartItems, cartTotal, hydrateCart } from '@/lib/cart';
import { isValidUaPhone, PHONE_PLACEHOLDER } from '@/lib/phone';
import { PhoneInput } from '@/components/forms/PhoneInput';
import { useCart } from './CartProvider';

export function CartCheckout({
  products: initialProducts,
  pickupHint,
}: {
  products?: (Product | ProductCardDTO)[];
  pickupHint?: string;
}) {
  const { lines, setQty, remove, clear, ready } = useCart();
  const [catalogItems, setCatalogItems] = useState<(Product | ProductCardDTO)[]>(initialProducts ?? []);
  const [loadingItems, setLoadingItems] = useState(false);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [retryNonce, setRetryNonce] = useState(0);

  const loadedIdsRef = useRef<Set<string>>(new Set((initialProducts ?? []).map((p) => p.id)));
  const inFlightIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!ready || lines.length === 0) return;
    const missingIds = lines
      .map((l) => l.id)
      .filter((id) => !loadedIdsRef.current.has(id) && !inFlightIdsRef.current.has(id))
      .slice(0, 50);

    if (missingIds.length === 0) return;

    const inFlight = inFlightIdsRef.current;
    for (const id of missingIds) {
      inFlight.add(id);
    }

    let active = true;
    setLoadingItems(true);

    fetch('/api/catalog/lookup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: missingIds }),
    })
      .then((res) => {
        if (!res.ok) throw new Error(`Lookup failed with status ${res.status}`);
        return res.json();
      })
      .then((data) => {
        if (!active || !data?.items) return;
        setCatalogItems((prev) => {
          const map = new Map(prev.map((p) => [p.id, p]));
          for (const item of data.items) {
            map.set(item.id, item);
            loadedIdsRef.current.add(item.id);
          }
          return Array.from(map.values());
        });
        setLookupError(null);
      })
      .catch((err: unknown) => {
        if (!active) return;
        console.error('Cart items lookup error:', err);
        setLookupError('Не вдалося перевірити актуальність цін та наявність товарів через мережеву помилку.');
      })
      .finally(() => {
        for (const id of missingIds) {
          inFlight.delete(id);
        }
        if (active) setLoadingItems(false);
      });

    return () => {
      active = false;
      for (const id of missingIds) {
        inFlight.delete(id);
      }
    };
  }, [ready, lines, retryNonce]);

  const hydrated = useMemo(() => hydrateCart(lines, catalogItems), [lines, catalogItems]);
  const items = availableCartItems(hydrated);
  const total = cartTotal(items);
  const router = useRouter();
  const [fulfillment, setFulfillment] = useState<'pickup' | 'delivery'>('pickup');
  const [status, setStatus] = useState('');
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (lookupError) {
      setError(true);
      setStatus('Будь ласка, оновіть перевірку наявності товарів перед замовленням');
      return;
    }
    const form = e.currentTarget;
    const fd = new FormData(form);
    const phone = String(fd.get('phone') || '');
    if (!isValidUaPhone(phone)) {
      setError(true);
      setStatus('Введіть коректний номер телефону');
      return;
    }
    const address = String(fd.get('address') || '').trim();
    if (fulfillment === 'delivery' && address.length < 5) {
      setError(true);
      setStatus('Вкажіть адресу для доставки');
      return;
    }

    setLoading(true);
    setStatus('');
    setError(false);

    try {
      const res = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone,
          name: String(fd.get('name') || ''),
          comment: String(fd.get('comment') || ''),
          website: String(fd.get('website') || ''),
          fulfillment,
          address: fulfillment === 'delivery' ? address : undefined,
          items: items.map((i) => ({ id: i.id, qty: i.qty })),
          pagePath: '/cart',
        }),
      });

      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(true);
        setStatus(data?.error || 'Не вдалося надіслати заявку');
        return;
      }

      clear();
      const orderId = data?.orderId ? `?id=${data.orderId}` : '';
      router.push(`/cart/thank-you${orderId}`);
    } catch {
      setError(true);
      setStatus('Помилка мережі. Перевірте звʼязок.');
    } finally {
      setLoading(false);
    }
  }

  if (!ready) {
    return (
      <div className='cart-empty'>
        <p className='cart-empty__text'>Завантаження кошика…</p>
      </div>
    );
  }

  if (lines.length === 0) {
    return (
      <div className='cart-empty'>
        <p className='cart-empty__text'>Кошик порожній</p>
        <Link href='/shop' className='by-btn cart-empty__btn'>
          До каталогу
        </Link>
      </div>
    );
  }

  if (loadingItems && catalogItems.length === 0 && !lookupError) {
    return (
      <div className='cart-empty'>
        <p className='cart-empty__text'>Завантаження товарів…</p>
      </div>
    );
  }

  return (
    <div className='cart-layout'>
      <div className='cart-lines'>
        {lookupError ? (
          <div
            className='cart-lookup-error'
            role='alert'
            style={{
              padding: '1rem',
              marginBottom: '1.5rem',
              borderRadius: '8px',
              backgroundColor: '#fff3cd',
              color: '#856404',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '1rem',
            }}
          >
            <span>{lookupError}</span>
            <button
              type='button'
              className='by-btn by-btn--outline'
              onClick={() => setRetryNonce((n) => n + 1)}
              style={{ whiteSpace: 'nowrap' }}
            >
              Спробувати знову
            </button>
          </div>
        ) : null}

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
                    <strong className='cart-row__title'>
                      {lookupError ? 'Перевірка статусу товару…' : 'Товар недоступний'}
                    </strong>
                  )}
                  {!row.available && !lookupError ? (
                    <p className='cart-row__warn'>
                      {row.reason === 'oos' ? 'Немає в наявності' : 'Більше не продається'}
                    </p>
                  ) : row.available ? (
                    <p className='cart-row__unit'>{unit.toLocaleString('uk-UA')} ₴ / шт</p>
                  ) : null}
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
                  {row.available ? <p className='cart-row__line-total'>{lineTotal.toLocaleString('uk-UA')} ₴</p> : null}
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
            <legend className='cart-fulfillment__legend'>Спосіб отримання</legend>
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

          <button
            className='by-btn cart-panel__submit'
            type='submit'
            disabled={loading || loadingItems || Boolean(lookupError) || !items.length}
          >
            {loading ? 'Надсилаємо…' : 'Оформити заявку'}
          </button>
          {status ? <p className={`status${error ? ' status--error' : ''}`}>{status}</p> : null}
        </form>
      </aside>
    </div>
  );
}
