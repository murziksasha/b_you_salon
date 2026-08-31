import Link from 'next/link';
import type { SalonService, ServicesGridSection as ServicesGridSectionType } from '@/lib/types';
import { PublicImage } from '@/components/ui/PublicImage';
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
        <div className='by-grid svc-grid'>
          {items.map((svc) => (
            <Link key={svc.id} href={`/salon/${svc.slug}`} className='svc-card'>
              <div className='svc-card__media'>
                {svc.image ? (
                  <PublicImage
                    src={svc.image}
                    alt={svc.title}
                    width={640}
                    height={420}
                    sizes='(max-width: 860px) 100vw, 33vw'
                  />
                ) : null}
                {svc.category ? <span className='svc-card__cat'>{svc.category}</span> : null}
              </div>
              <div className='svc-card__body'>
                <h3 className='svc-card__title'>{svc.title}</h3>
                <p className='svc-card__price'>{formatPriceFrom(svc.priceFrom, svc.priceNote)}</p>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
