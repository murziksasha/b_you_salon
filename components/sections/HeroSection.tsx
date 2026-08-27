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
  return (
    <div className="services">
      <div className="wrapper services__wrapper">
        <ServicesNav
          items={servicesNav}
          activeSlug={section.activeServiceSlug}
          heroImages={heroImages}
        />
        <aside className="services__aside">
          <div className="services__top">
            <h1 className="services__title _title" dangerouslySetInnerHTML={{ __html: sanitizeHtml(section.titleHtml) }} />
            <div className="services__about">
              {section.aboutLines.map((line) => (
                <p key={line} className="services__about-info _paragr" dangerouslySetInnerHTML={{ __html: sanitizeHtml(line) }} />
              ))}
            </div>
          </div>
          <div className="services__callback _callback">
            <p
              className="_callback__title _paragr"
              dangerouslySetInnerHTML={{ __html: sanitizeHtml(section.callbackTitleHtml ?? section.callbackTitle) }}
            />
            <CallbackForm
              buttonText={section.callbackButtonText}
              buttonHtml={section.callbackButtonHtml}
              placeholder={section.callbackPlaceholder}
            />
          </div>
          <div className={`services__main-img${section.imageClass ? ` ${section.imageClass}` : ''}`}>
            <PublicImage
              src={section.image}
              alt={section.imageAlt}
              width={500}
              height={400}
              className={section.imageClass}
              sizes="(max-width: 900px) 90vw, 500px"
              priority
              viewTransitionName="service-hero"
            />
          </div>
        </aside>
      </div>
    </div>
  );
}
