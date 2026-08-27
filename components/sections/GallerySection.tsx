import type { GallerySection as GallerySectionType } from '@/lib/types';

export function GallerySection({ section }: { section: GallerySectionType }) {
  if (!section.images?.length) return null;
  return (
    <section className='by-section'>
      <div className='by-wrap'>
        {section.title ? <h2 className='by-section__title'>{section.title}</h2> : null}
        <div className='gallery-grid'>
          {section.images.map((src) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={src} src={src} alt={section.title || 'Галерея B_You'} />
          ))}
        </div>
      </div>
    </section>
  );
}
