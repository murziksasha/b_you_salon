import Image from 'next/image';
import type {
  ContactsPerson,
  ContactsSection as ContactsSectionType,
  PhoneEntry,
  SiteSettings,
  SocialLink,
} from '@/lib/types';
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

function resolvePeople(
  section: ContactsSectionType,
  settings?: SiteSettings,
): ContactsPerson[] | null {
  if (section.people?.length) return section.people;
  const phones = resolvePhones(section, settings);
  const social = resolveSocial(section, settings);
  if (!phones.length && !social.length) return null;
  return [
    {
      id: 'default',
      title: '',
      phones,
      social,
    },
  ];
}

function SocialIcons({ links }: { links: SocialLink[] }) {
  if (!links.length) return null;
  return (
    <div className='contacts__social'>
      {links.map((link) => (
        <a key={link.id} href={link.url} target='_blank' rel='noreferrer' aria-label={link.type}>
          <Image src={link.icon} alt='' width={42} height={42} className='contacts__social-icon' />
        </a>
      ))}
    </div>
  );
}

function PersonCard({ person }: { person: ContactsPerson }) {
  return (
    <div className='contacts__person'>
      {person.title ? <p className='contacts__person-title'>{person.title}</p> : null}
      <div className='contacts__person-row'>
        {person.phones?.length ? (
          <p className='contacts__phone'>
            {person.phones.map((phone) => (
              <a key={phone.tel || phone.display} href={`tel:${phone.tel}`}>
                {phone.display}
              </a>
            ))}
          </p>
        ) : null}
        <SocialIcons links={person.social || []} />
      </div>
    </div>
  );
}

export function ContactsSection({
  section,
  settings,
}: {
  section: ContactsSectionType;
  settings?: SiteSettings;
}) {
  const people = resolvePeople(section, settings);
  const email = section.email || settings?.email || '';
  const mapUrl = section.mapEmbedUrl || settings?.mapEmbedUrl || '';
  const findTitle = section.findTitle;
  const findLines = section.findLines;

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
            {people?.map((person) => (
              <PersonCard key={person.id} person={person} />
            ))}
            {email ? (
              <p className='contacts__mail'>
                <a href={`mailto:${email}`}>{email}</a>
              </p>
            ) : null}
          </div>
          <div className='contacts__aside'>
            {(findTitle || (findLines && findLines.length) || (!findTitle && !findLines)) && (
              <div className='contacts__find'>
                {findTitle ? <p className='contacts__find-title'>{findTitle}</p> : null}
                {findLines?.map((line) => (
                  <p key={line}>{line}</p>
                ))}
                {!findTitle && !findLines ? (
                  <>
                    <p className='contacts__find-title'>Як знайти</p>
                    <p>Салон — праворуч від входу.</p>
                    <p>Магазин косметики — ліворуч.</p>
                    {settings?.hours ? <p>{settings.hours}</p> : null}
                  </>
                ) : null}
              </div>
            )}
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
              <CallbackForm
                buttonText='Залишити заявку'
                className='by-form'
                intentChooser={Boolean(section.intentChooser)}
              />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
