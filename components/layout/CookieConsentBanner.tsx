'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useId, useState, type FormEvent } from 'react';
import {
  CONSENT_OPEN_EVENT,
  isCookieConsentChoice,
  readStoredConsent,
  writeStoredConsent,
  type CookieConsentChoice,
} from '@/lib/cookie-consent';

export function CookieConsentBanner({ privacyUrl }: { privacyUrl: string }) {
  const titleId = useId();
  const descId = useId();
  const pathname = usePathname() || '/';
  const [open, setOpen] = useState(true);

  useEffect(() => {
    if (readStoredConsent()) setOpen(false);
    const onOpen = () => setOpen(true);
    window.addEventListener(CONSENT_OPEN_EVENT, onOpen);
    return () => window.removeEventListener(CONSENT_OPEN_EVENT, onOpen);
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute('data-cookie-banner', open ? 'open' : 'done');
  }, [open]);

  function choose(choice: CookieConsentChoice) {
    writeStoredConsent(choice);
    setOpen(false);
  }

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    const submitter = (e.nativeEvent as SubmitEvent).submitter;
    const value = submitter instanceof HTMLButtonElement ? submitter.value : '';
    if (!isCookieConsentChoice(value)) return;
    e.preventDefault();
    choose(value);
  }

  function onChoiceClick(choice: CookieConsentChoice) {
    return (e: { preventDefault: () => void }) => {
      e.preventDefault();
      choose(choice);
    };
  }

  if (!open) return null;

  const policy = privacyUrl.trim() || '/confident';

  return (
    <div
      className='cookie-banner'
      role='dialog'
      aria-modal='false'
      aria-label='Файли cookie'
      aria-labelledby={titleId}
      aria-describedby={descId}
    >
      <div className='by-wrap cookie-banner__inner'>
        <div className='cookie-banner__copy'>
          <h2 className='cookie-banner__title' id={titleId}>
            Файли cookie
          </h2>
          <p className='cookie-banner__text' id={descId}>
            Ми використовуємо файли cookie та збереження на пристрої (тема, кошик), щоб сайт працював зручно. Оберіть, чи
            погоджуєтесь.{' '}
            <Link href={policy}>Політика конфіденційності</Link>
          </p>
        </div>
        <form className='cookie-banner__actions' action='/api/cookie-consent' method='post' onSubmit={onSubmit}>
          <input type='hidden' name='next' value={pathname} />
          <button type='submit' name='choice' value='all' className='by-btn' onClick={onChoiceClick('all')}>
            Прийняти
          </button>
          <button
            type='submit'
            name='choice'
            value='necessary'
            className='by-btn by-btn--ghost'
            onClick={onChoiceClick('necessary')}
          >
            Лише необхідні
          </button>
        </form>
      </div>
    </div>
  );
}
