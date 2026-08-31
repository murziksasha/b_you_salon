import Image from 'next/image';
import type { ContactsSection as ContactsSectionType, PhoneEntry, SiteSettings, SocialLink } from '@/lib/types';
import { CallbackForm } from '@/components/forms/CallbackForm';
import { sanitizeHtml } from '@/lib/sanitize';

function resolvePhones(section: ContactsSectionType, settings?: SiteSettings): PhoneEntry[] {
  if (section.phones?.length) return section.phones;
  if (!settings) return [];
  const list: PhoneEntry[] = [];
  if (settings.headerPhone?.tel || settings.headerPhone?.display) {
    list.push(settings.headerPhone);
  }
  for (const p of settings.phones || []) {
    if (list.some((x) => x.tel === p.tel)) continue;
    list.push(p);
  }
  return list;
}

function resolveSocial(section: ContactsSectionType, settings?: SiteSettings): SocialLink[] {
  if (section.social?.length) return section.social;
  return settings?.social || [];
}

export function ContactsSection({
  section,
  settings,
}: {
  section: ContactsSectionType;
  settings?: SiteSettings;
}) {
  const phones = resolvePhones(section, settings);
  const social = resolveSocial(section, settings);
  const email = section.email || settings?.email || '';
  const mapUrl = section.mapEmbedUrl || settings?.mapEmbedUrl || '';

  return (
    <section className='contacts' id='contacts'>
      <div className='contacts__wrapper wrapper'>
        <div className='contacts__grid'>
          <div className='contacts__info'>
            <h2 className='contacts__title'>{section.title}</h2>
            {section.inviteText ? <p className='contacts__lead'>{section.inviteText}</p> : null}
            {section.addressHtml ? (
              <p
                className='contacts__address'
                dangerouslySetInnerHTML={{ __html: sanitizeHtml(section.addressHtml) }}
              />
            ) : null}
            {phones.length ? (
              <p className='contacts__phone'>
                {phones.map((phone) => (
                  <a key={phone.tel || phone.display} href={`tel:${phone.tel}`}>
                    {phone.display}
                  </a>
                ))}
              </p>
            ) : null}
            {email ? (
              <p className='contacts__mail'>
                <a href={`mailto:${email}`}>{email}</a>
              </p>
            ) : null}
            {social.length ? (
              <div className='contacts__social'>
                {social.map((link) => (
                  <a key={link.id} href={link.url} target='_blank' rel='noreferrer' aria-label={link.type}>
                    <Image src={link.icon} alt='' width={28} height={28} />
                  </a>
                ))}
              </div>
            ) : null}
          </div>
          <div className='contacts__aside'>
            <div className='contacts__find'>
              <p className='contacts__find-title'>Як знайти</p>
              <p>Салон — праворуч від входу.</p>
              <p>Магазин косметики — ліворуч.</p>
              {settings?.hours ? <p>{settings.hours}</p> : null}
            </div>
            {mapUrl ? (
              <div className='contacts__map'>
                <iframe
                  src={mapUrl}
                  width='479'
                  height='260'
                  style={{ border: 0 }}
                  allowFullScreen
                  loading='lazy'
                  referrerPolicy='no-referrer-when-downgrade'
                  title='Карта'
                />
              </div>
            ) : null}
            <div className='contacts__callback'>
              <p className='contacts__callback-title'>Залишіть заявку — передзвонимо</p>
              <CallbackForm buttonText='Залишити заявку' className='by-form' />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
