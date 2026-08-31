export interface MenuItem {
  id: string;
  label: string;
  href: string;
  visible: boolean;
}

export interface PhoneEntry {
  display: string;
  tel: string;
}

export interface SocialLink {
  id: string;
  type: 'viber' | 'telegram' | 'instagram' | 'youtube' | string;
  url: string;
  icon: string;
}

export type ZoneId = 'home' | 'salon' | 'shop';

export interface SiteSettings {
  title: string;
  description: string;
  logo: string;
  favicon: string;
  phones: PhoneEntry[];
  headerPhone: PhoneEntry;
  /** Manager phone for shop zone (header / footer / sticky call). */
  shopPhone?: PhoneEntry;
  social: SocialLink[];
  hours: string;
  address: string;
  addressNote: string;
  officeHours: string;
  email: string;
  mapEmbedUrl: string;
  copyright: string;
  privacyPolicyUrl: string;
  privacyPolicyText: string;
  /** Optional Google / external reviews URL for feedback CTA */
  reviewsUrl?: string;
  /** Open Graph / WhatsApp share image (1200×630). Falls back to /img/og-cover.jpg */
  ogImage?: string;
}

export interface ServiceNavItem {
  id: string;
  label: string;
  href: string;
  slug: string;
  visible: boolean;
}

export type ProductBadge = 'hit' | 'sale' | 'new' | '';

export interface Product {
  id: string;
  title: string;
  description: string;
  price: number;
  image: string;
  images?: string[];
  video?: string;
  visible: boolean;
  category?: string;
  code?: string;
  inStock?: boolean;
  badge?: ProductBadge | string;
  promoText?: string;
  sortPin?: boolean;
  relatedIds?: string[];
  createdAt?: string;
  updatedAt?: string;
}

export interface SalonService {
  id: string;
  title: string;
  slug: string;
  category: string;
  description: string;
  priceFrom: number;
  priceNote?: string;
  durationMin?: number;
  image: string;
  images?: string[];
  visible: boolean;
  sortPin?: boolean;
}

export interface SectionBase {
  id: string;
  type: string;
  visible: boolean;
  hideOnMobile?: boolean;
  hideOnDesktop?: boolean;
}

export interface HeroSection extends SectionBase {
  type: 'hero';
  titleHtml: string;
  aboutLines: string[];
  callbackTitle: string;
  callbackTitleHtml?: string;
  callbackButtonText: string;
  callbackButtonHtml?: string;
  callbackPlaceholder: string;
  image: string;
  imageAlt: string;
  imageClass?: string;
  activeServiceSlug?: string;
}

export interface DoorHalf {
  label: string;
  title: string;
  subtitle: string;
  href: string;
  cta: string;
  image?: string;
}

export interface DoorsHeroSection extends SectionBase {
  type: 'doors-hero';
  image: string;
  imageAlt?: string;
  kicker?: string;
  title?: string;
  subtitle?: string;
  left: DoorHalf;
  right: DoorHalf;
}

export interface ZoneDoorSection extends SectionBase {
  type: 'zone-door';
  side: 'left' | 'right';
  title: string;
  subtitle: string;
  href: string;
  cta: string;
  image: string;
  imageAlt?: string;
}

export interface ServicesNavSection extends SectionBase {
  type: 'services-nav';
  activeSlug?: string;
}

export interface AdvantageItem {
  icon: string;
  iconAlt: string;
  textHtml: string;
}

export interface AdvantagesSection extends SectionBase {
  type: 'advantages';
  items: AdvantageItem[];
}

export interface MalfunctionsSection extends SectionBase {
  type: 'malfunctions';
  title: string;
  intro: string;
  items: string[];
  image: string;
  imageAlt: string;
  imageClass?: string;
}

export interface AboutLinkItem {
  href: string;
  image: string;
  imageAlt: string;
  label: string;
}

export interface AboutLinksSection extends SectionBase {
  type: 'about-links';
  titleHtml: string;
  subtitle: string;
  items: AboutLinkItem[];
}

export interface FeedbackQuote {
  name: string;
  text: string;
  service?: string;
}

export interface FeedbackSection extends SectionBase {
  type: 'feedback';
  images: string[];
  quotes?: FeedbackQuote[];
  moreReviewsButtonText: string;
}

export interface ContactsSection extends SectionBase {
  type: 'contacts';
  title: string;
  inviteText: string;
  addressHtml: string;
  phones: PhoneEntry[];
  email: string;
  social: SocialLink[];
  mapEmbedUrl: string;
}

export interface CallbackSection extends SectionBase {
  type: 'callback';
  title: string;
  titleHtml?: string;
  buttonText: string;
  buttonHtml?: string;
  placeholder: string;
  activeServiceId?: string;
}

export interface ShopGridSection extends SectionBase {
  type: 'shop-grid';
  title?: string;
  subtitle?: string;
}

export interface ServicesGridSection extends SectionBase {
  type: 'services-grid';
  title?: string;
  subtitle?: string;
  category?: string;
  limit?: number;
}

export interface PriceListItem {
  title: string;
  price: string;
  note?: string;
}

export interface PriceListGroup {
  title: string;
  items: PriceListItem[];
}

export interface PriceListSection extends SectionBase {
  type: 'price-list';
  title?: string;
  source: 'catalog' | 'manual';
  category?: string;
  groups?: PriceListGroup[];
}

export interface GallerySection extends SectionBase {
  type: 'gallery';
  title?: string;
  images: string[];
}

export interface RichTextSection extends SectionBase {
  type: 'rich-text';
  html: string;
}

export type Section =
  | HeroSection
  | DoorsHeroSection
  | ZoneDoorSection
  | ServicesNavSection
  | AdvantagesSection
  | MalfunctionsSection
  | AboutLinksSection
  | FeedbackSection
  | ContactsSection
  | CallbackSection
  | ShopGridSection
  | ServicesGridSection
  | PriceListSection
  | GallerySection
  | RichTextSection;

export interface Page {
  id: string;
  slug: string;
  title: string;
  description: string;
  visible: boolean;
  zone?: ZoneId;
  sections: Section[];
  contentHtml?: string;
  titleSize?: number;
  textScale?: number;
  draft?: {
    title?: string;
    description?: string;
    sections?: Section[];
    contentHtml?: string;
    titleSize?: number;
    textScale?: number;
    updatedAt?: string;
  };
  publishAt?: string;
  reviewRequested?: boolean;
  reviewRequestedAt?: string;
  reviewRequestedBy?: string;
}

export interface SiteData {
  settings: SiteSettings;
  headerMenu: MenuItem[];
  headerMenuSalon?: MenuItem[];
  headerMenuShop?: MenuItem[];
  servicesNav: ServiceNavItem[];
  shopLink?: MenuItem;
  pages: Page[];
  goods: Product[];
  services?: SalonService[];
  updatedAt?: string;
}
