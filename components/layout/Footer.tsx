'use client';

import Link from 'next/link';
import { BrandMark } from '@/components/brand/BrandMark';
import { requestCookieConsentOpen } from '@/lib/cookie-consent';
import type { SiteSettings, SocialLink } from '@/lib/types';
import { formatTelHref } from '@/lib/phone';

const FOOTER_LEAD = 'Два простори — один вхід';

const IRYNA_PHONES = [
  { display: '093 632 72 24', tel: '+380936327224' },
  { display: '050 544 37 19', tel: '+380505443719' },
] as const;

const SOCIAL_LABEL: Record<string, string> = {
  telegram: 'Telegram',
  viber: 'Viber',
  instagram: 'Instagram',
  youtube: 'YouTube',
};

function socialLabel(link: SocialLink) {
  return SOCIAL_LABEL[link.type] || link.type;
}

export function Footer({ settings }: { settings: SiteSettings }) {
  const policyUrl = settings.privacyPolicyUrl || '/confident';

  const address = settings.address?.trim() || 'м. Чорноморськ, вул. Вишнева, 4';
  const hours = settings.hours?.trim() || 'Пн–Сб 09:00–18:00';
  const nataliaPhones = (settings.phones || []).filter((p) => p.display || p.tel);

  return (
    <footer className='by-footer'>
      <div className='by-wrap by-footer__grid'>
        <div className='by-footer__col'>
          <BrandMark />
          <p className='by-footer__lead'>{FOOTER_LEAD}</p>
          <p className='by-footer__policy'>
            <Link href={policyUrl}>Політика конфіденційності</Link>
          </p>
          <nav className='by-footer__nav' aria-label='Футер'>
            <Link href='/salon'>Салон</Link>
            <Link href='/shop'>Магазин</Link>
            <Link href='/#contacts'>Контакти</Link>
          </nav>
        </div>

        <div className='by-footer__col'>
          <p className='by-footer__address'>{address}</p>
          <p className='by-footer__hours'>{hours}</p>
          <div className='by-footer__person'>
            <p className='by-footer__person-name'>Наталія</p>
            <p className='by-footer__person-role'>майстер-універсал</p>
            <p className='by-footer__phones'>
              {nataliaPhones.map((p) => (
                <a key={p.tel || p.display} href={formatTelHref(p.tel)}>
                  {p.display}
                </a>
              ))}
            </p>
          </div>
        </div>

        <div className='by-footer__col'>
          {settings.social?.length ? (
            <p className='by-footer__social'>
              {settings.social.map((link) => (
                <a key={link.id} href={link.url} target='_blank' rel='noreferrer'>
                  {socialLabel(link)}
                </a>
              ))}
            </p>
          ) : null}
          <p className='by-footer__policy'>
            <button
              type='button'
              className='by-footer__cookies'
              aria-haspopup='dialog'
              onClick={requestCookieConsentOpen}
            >
              Налаштування cookies
            </button>
          </p>
          <div className='by-footer__person'>
            <p className='by-footer__person-name'>Ірина</p>
            <p className='by-footer__person-role'>продавець-консультант</p>
            <p className='by-footer__phones'>
              {IRYNA_PHONES.map((p) => (
                <a key={p.tel} href={formatTelHref(p.tel)}>
                  {p.display}
                </a>
              ))}
            </p>
          </div>
        </div>
      </div>
    </footer>
  );
}
