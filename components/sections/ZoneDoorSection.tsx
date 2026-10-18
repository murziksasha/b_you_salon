import type { ZoneDoorSection as ZoneDoorSectionType } from '@/lib/types';
import { PublicImage } from '@/components/ui/PublicImage';

export function ZoneDoorSection({ section }: { section: ZoneDoorSectionType }) {
  return (
    <div className='by-section'>
      <div className='by-wrap'>
        <a
          href={section.href}
          className={`zone-door${section.side === 'right' ? ' zone-door--right' : ''}`}
        >
          {section.image ? (
            <PublicImage
              src={section.image}
              alt={section.imageAlt || section.title}
              width={720}
              height={480}
              sizes='(max-width: 860px) 100vw, 55vw'
            />
          ) : null}
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
