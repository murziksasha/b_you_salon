import type { SalonService, ServicesGridSection as ServicesGridSectionType } from '@/lib/types';
import { ServicesGridFilter } from './ServicesGridFilter';
import { visibleServices } from '@/lib/services-catalog';

export function ServicesGridSection({
  section,
  services,
}: {
  section: ServicesGridSectionType;
  services: SalonService[];
}) {
  const hasAny = visibleServices(services).length > 0;
  if (!hasAny) return null;

  return (
    <section className='by-section'>
      <div className='by-wrap'>
        {section.title ? <h2 className='by-section__title'>{section.title}</h2> : null}
        {section.subtitle ? <p className='by-section__sub'>{section.subtitle}</p> : null}
        <ServicesGridFilter services={services} category={section.category} limit={section.limit} />
      </div>
    </section>
  );
}
