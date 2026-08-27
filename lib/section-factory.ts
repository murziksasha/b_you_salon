import type { Page, Section, ZoneId } from './types';
import { createId } from './id';

export const SECTION_TYPES = [
  'doors-hero',
  'hero',
  'advantages',
  'services-grid',
  'price-list',
  'callback',
  'feedback',
  'contacts',
  'shop-grid',
  'zone-door',
  'gallery',
  'rich-text',
  'about-links',
] as const;

export type SectionType = (typeof SECTION_TYPES)[number];

export const SECTION_LABELS: Record<string, string> = {
  'doors-hero': 'Двері (салон / магазин)',
  hero: 'Hero (заголовок + форма)',
  advantages: 'Переваги',
  'services-grid': 'Сітка послуг салону',
  'price-list': 'Прайс',
  callback: 'Форма запису / передзвону',
  feedback: 'Відгуки',
  contacts: 'Контакти',
  'shop-grid': 'Магазин (сітка товарів)',
  'zone-door': 'Банер іншої зони',
  gallery: 'Галерея',
  'rich-text': 'Текст',
  'about-links': 'Посилання / картки',
  'services-nav': 'Навігація послуг',
  malfunctions: 'Список (legacy)',
};

export function newSection(type: SectionType | string): Section {
  const id = createId();
  switch (type) {
    case 'doors-hero':
      return {
        id,
        type: 'doors-hero',
        visible: true,
        image: '/img/hero/interior.jpg',
        imageAlt: 'Інтер’єр B_You',
        kicker: 'Be you!',
        title: 'B_You',
        subtitle: 'студія краси · салон праворуч · магазин косметики ліворуч',
        left: {
          label: 'Ліворуч',
          title: 'Магазин косметики',
          subtitle: 'Догляд, який забираєте з собою',
          href: '/shop',
          cta: 'У магазин',
        },
        right: {
          label: 'Праворуч',
          title: 'Салон краси',
          subtitle: 'Манікюр, волосся, брови та вії',
          href: '/salon',
          cta: 'До салону',
        },
      };
    case 'hero':
      return {
        id,
        type: 'hero',
        visible: true,
        titleHtml: 'Заголовок',
        aboutLines: [''],
        callbackTitle: 'Залиште заявку',
        callbackButtonText: 'Надіслати',
        callbackPlaceholder: '+38 (___) ___ __ __',
        image: '/img/hero/interior.jpg',
        imageAlt: 'B_You',
      };
    case 'advantages':
      return { id, type: 'advantages', visible: true, items: [] };
    case 'services-grid':
      return {
        id,
        type: 'services-grid',
        visible: true,
        title: 'Послуги салону',
        subtitle: '',
      };
    case 'price-list':
      return {
        id,
        type: 'price-list',
        visible: true,
        title: 'Прайс',
        source: 'catalog',
        groups: [],
      };
    case 'callback':
      return {
        id,
        type: 'callback',
        visible: true,
        title: 'Записатись',
        buttonText: 'Надіслати',
        placeholder: '+38 (___) ___ __ __',
      };
    case 'feedback':
      return {
        id,
        type: 'feedback',
        visible: true,
        images: [],
        quotes: [],
        moreReviewsButtonText: 'Більше відгуків',
      };
    case 'contacts':
      return {
        id,
        type: 'contacts',
        visible: true,
        title: 'Контакти',
        inviteText: '',
        addressHtml: '',
        phones: [],
        email: '',
        social: [],
        mapEmbedUrl: '',
      };
    case 'shop-grid':
      return { id, type: 'shop-grid', visible: true, title: 'Магазин', subtitle: '' };
    case 'zone-door':
      return {
        id,
        type: 'zone-door',
        visible: true,
        side: 'left',
        title: 'Магазин косметики',
        subtitle: 'Ліворуч від входу в салон',
        href: '/shop',
        cta: 'У магазин',
        image: '/img/hero/interior.jpg',
      };
    case 'gallery':
      return { id, type: 'gallery', visible: true, title: 'Галерея', images: [] };
    case 'rich-text':
      return { id, type: 'rich-text', visible: true, html: '<p></p>' };
    case 'about-links':
      return {
        id,
        type: 'about-links',
        visible: true,
        titleHtml: 'Заголовок',
        subtitle: '',
        items: [],
      };
    case 'services-nav':
      return { id, type: 'services-nav', visible: true };
    default:
      return {
        id,
        type: 'callback',
        visible: true,
        title: '',
        buttonText: '',
        placeholder: '',
      };
  }
}

export function createDefaultPage(opts: {
  title: string;
  slug: string;
  email?: string;
  mapEmbedUrl?: string;
  zone?: ZoneId;
}): Page {
  return {
    id: createId(),
    slug: opts.slug,
    title: opts.title,
    description: opts.title,
    visible: true,
    zone: opts.zone || (opts.slug.startsWith('salon') ? 'salon' : opts.slug === 'shop' ? 'shop' : 'home'),
    sections: [
      { ...newSection('hero'), titleHtml: opts.title } as Section,
      newSection('callback'),
      {
        ...newSection('contacts'),
        email: opts.email || '',
        mapEmbedUrl: opts.mapEmbedUrl || '',
      } as Section,
    ],
  };
}
