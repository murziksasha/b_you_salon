import type { ReactNode } from 'react';
import type { Product, SalonService, Section, ServiceNavItem, SiteSettings } from '@/lib/types';
import { AboutLinksSection } from './AboutLinksSection';
import { AdvantagesSection } from './AdvantagesSection';
import { CallbackBlock } from './CallbackBlock';
import { ContactsSection } from './ContactsSection';
import { DoorsHeroSection } from './DoorsHeroSection';
import { FeedbackSection } from './FeedbackSection';
import { GallerySection } from './GallerySection';
import { HeroSection } from './HeroSection';
import { PriceListSection } from './PriceListSection';
import { RichTextSection } from './RichTextSection';
import { ServicesGridSection } from './ServicesGridSection';
import { ServicesNav } from './ServicesNav';
import { ShopGridSection } from './ShopGridSection';
import { ZoneDoorSection } from './ZoneDoorSection';

interface SectionRendererProps {
  sections: Section[];
  servicesNav: ServiceNavItem[];
  products: Product[];
  services?: SalonService[];
  reviewsUrl?: string;
  settings?: SiteSettings;
  heroImages?: Record<string, string>;
}

export function SectionRenderer({
  sections,
  servicesNav,
  products,
  services = [],
  reviewsUrl,
  settings,
  heroImages,
}: SectionRendererProps) {
  const visible = sections.filter((s) => s.visible);
  const hasHero = visible.some((s) => s.type === 'hero' || s.type === 'doors-hero');

  return (
    <>
      {visible.map((section) => {
        let node: ReactNode = null;
        switch (section.type) {
          case 'doors-hero':
            node = <DoorsHeroSection section={section} />;
            break;
          case 'hero':
            node = (
              <HeroSection section={section} servicesNav={servicesNav} heroImages={heroImages} />
            );
            break;
          case 'services-nav':
            if (hasHero) return null;
            node = (
              <div className='by-wrap' style={{ paddingTop: '1.5rem' }}>
                <ServicesNav items={servicesNav} activeSlug={section.activeSlug} heroImages={heroImages} />
              </div>
            );
            break;
          case 'advantages':
            node = (
              <div className='by-section'>
                <div className='by-wrap'>
                  <AdvantagesSection section={section} />
                </div>
              </div>
            );
            break;
          case 'services-grid':
            node = <ServicesGridSection section={section} services={services} />;
            break;
          case 'price-list':
            node = <PriceListSection section={section} services={services} />;
            break;
          case 'about-links':
            node = <AboutLinksSection section={section} />;
            break;
          case 'callback':
            node = (
              <div className='by-section' id='callback'>
                <div className='by-wrap'>
                  <CallbackBlock section={section} services={services} />
                </div>
              </div>
            );
            break;
          case 'feedback':
            node = <FeedbackSection section={section} reviewsUrl={reviewsUrl} />;
            break;
          case 'contacts':
            node = <ContactsSection section={section} settings={settings} />;
            break;
          case 'shop-grid':
            node = <ShopGridSection section={section} products={products} />;
            break;
          case 'zone-door':
            node = <ZoneDoorSection section={section} />;
            break;
          case 'gallery':
            node = <GallerySection section={section} />;
            break;
          case 'rich-text':
            node = <RichTextSection section={section} />;
            break;
          default:
            return null;
        }
        const vp = [
          section.hideOnMobile ? 'ps-hide-mobile' : '',
          section.hideOnDesktop ? 'ps-hide-desktop' : '',
        ]
          .filter(Boolean)
          .join(' ');
        if (!vp) {
          return <div key={section.id}>{node}</div>;
        }
        return (
          <div key={section.id} className={vp}>
            {node}
          </div>
        );
      })}
    </>
  );
}
