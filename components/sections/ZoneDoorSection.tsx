import type { ZoneDoorSection as ZoneDoorSectionType } from '@/lib/types';

export function ZoneDoorSection({ section }: { section: ZoneDoorSectionType }) {
  return (
    <div className='by-section'>
      <div className='by-wrap'>
        <a
          href={section.href}
          className={`zone-door${section.side === 'right' ? ' zone-door--right' : ''}`}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={section.image} alt={section.imageAlt || section.title} />
          <span className='zone-door__copy'>
            <span className='doors__label'>{section.side === 'left' ? 'Ліворуч' : 'Праворуч'}</span>
            <h2 className='by-section__title'>{section.title}</h2>
            <p className='by-section__sub'>{section.subtitle}</p>
            <span className='by-btn'>{section.cta}</span>
          </span>
        </a>
      </div>
    </div>
  );
}
