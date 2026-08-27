import Link from 'next/link';
import type { AboutLinksSection as AboutLinksSectionType } from '@/lib/types';
import { PublicImage } from '@/components/ui/PublicImage';
import { sanitizeHtml } from '@/lib/sanitize';
import { AdvantagesSection } from './AdvantagesSection';
import type { AdvantagesSection as AdvantagesSectionType } from '@/lib/types';

export function AboutLinksSection({
  section,
  advantages,
}: {
  section: AboutLinksSectionType;
  advantages?: AdvantagesSectionType;
}) {
  return (
    <div className='about-link'>
      <div className='about-link__wrapper wrapper' id='about_company'>
        {advantages ? <AdvantagesSection section={advantages} /> : null}
        <div className='about-link__line line' aria-hidden>
          <div className='line__circle line__circle_left' />
        </div>
        <h2
          className='about-link__title _title'
          dangerouslySetInnerHTML={{ __html: sanitizeHtml(section.titleHtml) }}
        />
        {section.subtitle ? <p className='about-link__paragr'>{section.subtitle}</p> : null}
        <div className='about-link__items-wrapper'>
          {section.items.map((item) => (
            <div key={`${item.href}-${item.label}`} className='about-link__item'>
              <Link href={item.href} className='about-link__link'>
                <PublicImage
                  src={item.image}
                  alt={item.imageAlt || item.label}
                  className='about-link__img'
                  width={220}
                  height={220}
                  sizes='(max-width: 600px) 40vw, 220px'
                  softPlaceholder={false}
                />
                <span className='about-link__descr'>{item.label}</span>
              </Link>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
