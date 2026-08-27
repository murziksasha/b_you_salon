import Link from 'next/link';
import type { SalonService, ServicesGridSection as ServicesGridSectionType } from '@/lib/types';
import { formatPriceFrom, servicesByCategory } from '@/lib/services-catalog';

export function ServicesGridSection({
  section,
  services,
}: {
  section: ServicesGridSectionType;
  services: SalonService[];
}) {
  const items = servicesByCategory(services, section.category, section.limit);
  if (!items.length) return null;
  return (
    <section className='by-section'>
      <div className='by-wrap'>
        {section.title ? <h2 className='by-section__title'>{section.title}</h2> : null}
        {section.subtitle ? <p className='by-section__sub'>{section.subtitle}</p> : null}
        <div className='by-grid'>
          {items.map((svc) => (
            <Link key={svc.id} href={`/salon/${svc.slug}`} className='by-card'>
              <div className='by-card__img'>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={svc.image} alt={svc.title} />
              </div>
              <div className='by-card__body'>
                <div className='by-card__cat'>{svc.category}</div>
                <h3 className='by-card__title'>{svc.title}</h3>
                <p className='by-price'>{formatPriceFrom(svc.priceFrom, svc.priceNote)}</p>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
