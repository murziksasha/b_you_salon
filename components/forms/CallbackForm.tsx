'use client';

import { FormEvent, useId, useState } from 'react';
import { isValidUaPhone, PHONE_PLACEHOLDER } from '@/lib/phone';
import { sanitizeHtml } from '@/lib/sanitize';
import type { SalonService } from '@/lib/types';
import { PhoneInput } from './PhoneInput';

const MESSAGES = {
  loading: 'Завантаження...',
  success: "Дякуємо! Скоро ми з вами зв'яжемося",
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

interface CallbackFormProps {
  buttonText: string;
  buttonHtml?: string;
  placeholder?: string;
  className?: string;
  services?: SalonService[];
  activeServiceId?: string;
}

export function CallbackForm({
  buttonText,
  buttonHtml,
  placeholder = PHONE_PLACEHOLDER,
  className = 'by-form',
  services = [],
  activeServiceId,
}: CallbackFormProps) {
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
      const pagePath = `${window.location.pathname}${window.location.search}`.slice(0, 300);
      const pageTitle = (document.title || '').slice(0, 120);
      formData.set('pagePath', pagePath);
      formData.set('pageTitle', pageTitle);

      const response = await fetch('/api/contact', { method: 'POST', body: formData });
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
          setIsError(true);
          setStatus(MESSAGES.invalid);
          return;
        }
        throw new Error('Request failed');
      }
      setIsError(false);
      setStatus(MESSAGES.success);
      form.reset();
      window.setTimeout(() => setStatus(''), 3000);
    } catch {
      setIsError(true);
      setStatus(MESSAGES.failure);
      window.setTimeout(() => setStatus(''), 5000);
    } finally {
      setLoading(false);
    }
  }

  return (
    <form className={className} onSubmit={handleSubmit} noValidate>
      {services.length ? (
        <label>
          <span className='visually-hidden'>Послуга</span>
          <select name='serviceId' defaultValue={activeServiceId || ''}>
            <option value=''>Не знаю / консультація</option>
            {services
              .filter((s) => s.visible)
              .map((s) => (
                <option key={s.id} value={s.id}>
                  {s.title}
                </option>
              ))}
          </select>
        </label>
      ) : null}
      <label>
        <span className='visually-hidden'>Коментар</span>
        <textarea name='comment' rows={2} placeholder='Коментар (необовʼязково)' />
      </label>
      <label className='_callback__label' htmlFor={phoneId}>
        <span className='visually-hidden'>Номер телефону</span>
        <PhoneInput
          id={phoneId}
          name='phone'
          className='_callback__phone'
          placeholder={placeholder}
          aria-invalid={isError}
          aria-describedby={status ? statusId : undefined}
          required
        />
      </label>
      {/* Honeypot */}
      <div className='form-hp' aria-hidden='true'>
        <label>
          Website
          <input type='text' name='website' tabIndex={-1} autoComplete='off' />
        </label>
      </div>
      <button className='by-btn' type='submit' disabled={loading} aria-busy={loading}>
        {buttonHtml ? (
          <span dangerouslySetInnerHTML={{ __html: sanitizeHtml(buttonHtml) }} />
        ) : (
          buttonText
        )}
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
