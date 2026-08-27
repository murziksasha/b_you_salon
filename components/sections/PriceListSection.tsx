import type { PriceListSection as PriceListSectionType, SalonService } from '@/lib/types';
import { formatPriceFrom, servicesByCategory } from '@/lib/services-catalog';

export function PriceListSection({
  section,
  services,
}: {
  section: PriceListSectionType;
  services: SalonService[];
}) {
  const catalog = servicesByCategory(services, section.category);
  const groups =
    section.source === 'manual' && section.groups?.length
      ? section.groups
      : [
          {
            title: section.title || 'Прайс',
            items: catalog.map((s) => ({
              title: s.title,
              price: formatPriceFrom(s.priceFrom, s.priceNote),
              note: s.durationMin ? `${s.durationMin} хв` : undefined,
            })),
          },
        ];

  return (
    <section className='by-section'>
      <div className='by-wrap'>
        {section.title ? <h2 className='by-section__title'>{section.title}</h2> : null}
        <div className='price-list'>
          {groups.map((group) => (
            <div key={group.title}>
              {group.title && group.title !== section.title ? (
                <h3 className='by-card__title'>{group.title}</h3>
              ) : null}
              {group.items.map((item) => (
                <div className='price-list__row' key={item.title}>
                  <span>
                    {item.title}
                    {item.note ? <small style={{ display: 'block', color: 'var(--by-muted)' }}>{item.note}</small> : null}
                  </span>
                  <strong className='by-price'>{item.price}</strong>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
