'use client';

import { FormEvent, useId, useState } from 'react';
import { isValidUaPhone, PHONE_PLACEHOLDER } from '@/lib/phone';
import { PhoneInput } from './PhoneInput';

const MESSAGES = {
  loading: 'Завантаження...',
  success: 'Дякуємо! Ми зв’яжемося щодо замовлення',
  failure: 'Щось пішло не так...',
  invalid: 'Введіть коректний номер телефону',
};

function formatRetryWait(sec: number): string {
  if (Number.isFinite(sec) && sec > 0 && sec < 60) return `${sec} с`;
  if (Number.isFinite(sec) && sec >= 60) {
    const m = Math.ceil(sec / 60);
    return m === 1 ? 'хвилину' : `${m} хв`;
  }
  return 'хвилину';
}

export function OrderForm({
  productId,
  productTitle,
}: {
  productId: string;
  productTitle: string;
}) {
  const [status, setStatus] = useState('');
  const [isError, setIsError] = useState(false);
  const [loading, setLoading] = useState(false);
  const statusId = useId();
  const phoneId = useId();

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    const phone = String(formData.get('phone') || '');

    if (!isValidUaPhone(phone)) {
      setIsError(true);
      setStatus(MESSAGES.invalid);
      return;
    }

    setLoading(true);
    setIsError(false);
    setStatus(MESSAGES.loading);

    try {
      formData.set('productId', productId);
      const response = await fetch('/api/orders', { method: 'POST', body: formData });
      if (!response.ok) {
        if (response.status === 429) {
          const retry = response.headers.get('Retry-After');
          const sec = retry ? parseInt(retry, 10) : 60;
          setIsError(true);
          setStatus(`Забагато запитів. Зачекайте ${formatRetryWait(sec)}.`);
          window.setTimeout(() => setStatus(''), 5000);
          return;
        }
        if (response.status === 400) {
          const json = (await response.json().catch(() => null)) as { error?: string } | null;
          setIsError(true);
          setStatus(
            json?.error === 'Product not available'
              ? 'Товар недоступний для замовлення'
              : MESSAGES.invalid,
          );
          return;
        }
        throw new Error('Request failed');
      }
      setIsError(false);
      setStatus(MESSAGES.success);
      form.reset();
      window.setTimeout(() => setStatus(''), 4000);
    } catch {
      setIsError(true);
      setStatus(MESSAGES.failure);
      window.setTimeout(() => setStatus(''), 5000);
    } finally {
      setLoading(false);
    }
  }

  return (
    <form className='shop-order' onSubmit={handleSubmit} noValidate>
      <h2 className='shop-order__title'>Замовити</h2>
      <p className='shop-order__hint'>
        Залиште номер — ми передзвонимо щодо «{productTitle}». Кількість і деталі узгодимо по телефону.
      </p>
      <label className='shop-order__label' htmlFor={phoneId}>
        Телефон
        <PhoneInput
          id={phoneId}
          name='phone'
          className='shop-order__phone'
          placeholder={PHONE_PLACEHOLDER}
          aria-invalid={isError}
          aria-describedby={status ? statusId : undefined}
          required
        />
      </label>
      <label className='shop-order__label'>
        Коментар <span className='shop-order__optional'>(необов&apos;язково)</span>
        <textarea
          name='comment'
          className='shop-order__comment'
          rows={3}
          maxLength={1000}
          placeholder='Наприклад: колір, під замовлення…'
        />
      </label>
      <div className='form-hp' aria-hidden='true'>
        <label>
          Website
          <input type='text' name='website' tabIndex={-1} autoComplete='off' />
        </label>
      </div>
      <button className='shop-order__btn _btn' type='submit' disabled={loading} aria-busy={loading}>
        Замовити
      </button>
      {status ? (
        <div
          id={statusId}
          className={`status${isError ? ' status--error' : ' status--ok'}`}
          role='status'
          aria-live='polite'
        >
          {status}
        </div>
      ) : null}
    </form>
  );
}
