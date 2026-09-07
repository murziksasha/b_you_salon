'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import type { SalonService } from '@/lib/types';
import { PublicImage } from '@/components/ui/PublicImage';
import { formatPriceFrom, servicesByCategory, visibleServices } from '@/lib/services-catalog';

function uniqueCategories(services: SalonService[]): string[] {
  const seen = new Set<string>();
  const list: string[] = [];
  for (const svc of visibleServices(services)) {
    const cat = (svc.category || '').trim();
    if (!cat || seen.has(cat)) continue;
    seen.add(cat);
    list.push(cat);
  }
  return list;
}

function ServiceCards({ items }: { items: SalonService[] }) {
  return (
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
          </div>
          <div className='svc-card__body'>
            <h3 className='svc-card__title'>{svc.title}</h3>
            <p className='svc-card__price'>{formatPriceFrom(svc.priceFrom, svc.priceNote)}</p>
          </div>
        </Link>
      ))}
    </div>
  );
}

export function ServicesGridFilter({
  services,
  category,
  limit,
}: {
  services: SalonService[];
  category?: string;
  limit?: number;
}) {
  const locked = Boolean((category || '').trim());
  const all = visibleServices(services);
  const categories = useMemo(() => uniqueCategories(services), [services]);
  const [active, setActive] = useState('');

  const filterCat = locked ? category : active || undefined;
  const items = servicesByCategory(services, filterCat, limit);
  const showGrouped = !locked && !active && categories.length >= 2 && !limit;

  const groups = useMemo(() => {
    if (!showGrouped) return [];
    return categories
      .map((cat) => ({
        key: cat,
        label: cat,
        items: servicesByCategory(services, cat),
      }))
      .filter((g) => g.items.length);
  }, [showGrouped, categories, services]);

  if (!all.length) return null;

  return (
    <>
      {!locked && categories.length > 1 ? (
        <div className='shop-chips' role='group' aria-label='Фільтр послуг за категорією'>
          <button
            type='button'
            className={`shop-chip${active === '' ? ' is-active' : ''}`}
            onClick={() => setActive('')}
          >
            Усі
          </button>
          {categories.map((cat) => (
            <button
              key={cat}
              type='button'
              className={`shop-chip${active === cat ? ' is-active' : ''}`}
              onClick={() => setActive(cat === active ? '' : cat)}
            >
              {cat}
            </button>
          ))}
        </div>
      ) : null}

      <p className='shop-catalog__meta' aria-live='polite'>
        {filterCat
          ? `Знайдено ${items.length} з ${all.length}`
          : `Послуг: ${all.length}`}
      </p>

      {items.length ? (
        showGrouped ? (
          <div className='shop-groups'>
            {groups.map((group) => (
              <section key={group.key} className='shop-group' aria-labelledby={`svc-group-${group.key}`}>
                <h3 className='shop-group__title' id={`svc-group-${group.key}`}>
                  {group.label}
                  <span className='shop-group__count'>{group.items.length}</span>
                </h3>
                <ServiceCards items={group.items} />
              </section>
            ))}
          </div>
        ) : (
          <ServiceCards items={items} />
        )
      ) : (
        <p className='by-section__sub'>Немає послуг у цій категорії.</p>
      )}
    </>
  );
}
