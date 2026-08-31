import type { HeroSection as HeroSectionType } from '@/lib/types';
import { CallbackForm } from '@/components/forms/CallbackForm';
import { PublicImage } from '@/components/ui/PublicImage';
import { sanitizeHtml } from '@/lib/sanitize';
import { ServicesNav } from './ServicesNav';
import type { ServiceNavItem } from '@/lib/types';

export function HeroSection({
  section,
  servicesNav,
  heroImages,
}: {
  section: HeroSectionType;
  servicesNav: ServiceNavItem[];
  /** slug/href → hero image for idle prefetch of sibling service pages */
  heroImages?: Record<string, string>;
}) {
  const aboutLines = (section.aboutLines || []).filter((line) => line && line.trim());

  return (
    <section className='by-hero-block'>
      <div className='by-wrap'>
        <ServicesNav items={servicesNav} activeSlug={section.activeServiceSlug} heroImages={heroImages} />
      </div>
      <div className='by-wrap by-hero'>
        <div className='by-hero__copy'>
          <h1
            className='by-hero__title'
            dangerouslySetInnerHTML={{ __html: sanitizeHtml(section.titleHtml) }}
          />
          {aboutLines.length ? (
            <div className='by-hero__about'>
              {aboutLines.map((line) => (
                <p
                  key={line}
                  className='by-hero__lead'
                  dangerouslySetInnerHTML={{ __html: sanitizeHtml(line) }}
                />
              ))}
            </div>
          ) : null}
          <div className='by-hero__form _callback'>
            <p
              className='_callback__title'
              dangerouslySetInnerHTML={{ __html: sanitizeHtml(section.callbackTitleHtml ?? section.callbackTitle) }}
            />
            <CallbackForm
              buttonText={section.callbackButtonText}
              buttonHtml={section.callbackButtonHtml}
              placeholder={section.callbackPlaceholder}
            />
          </div>
        </div>
        {section.image ? (
          <div className={`by-hero__media${section.imageClass ? ` ${section.imageClass}` : ''}`}>
            <PublicImage
              src={section.image}
              alt={section.imageAlt}
              width={720}
              height={560}
              className={section.imageClass}
              sizes='(max-width: 900px) 92vw, 560px'
              priority
              viewTransitionName='service-hero'
            />
          </div>
        ) : null}
      </div>
    </section>
  );
}
