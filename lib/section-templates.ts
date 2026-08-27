import type { Section } from './types';
import { newSection } from './section-factory';

export type SectionTemplate = {
  id: string;
  label: string;
  description: string;
  build: () => Section[];
};

export const SECTION_TEMPLATES: SectionTemplate[] = [
  {
    id: 'home-doors',
    label: 'Головна — дві двері',
    description: 'Спліт салон/магазин + контакти',
    build: () => [newSection('doors-hero'), newSection('contacts')],
  },
  {
    id: 'salon-landing',
    label: 'Лендінг салону',
    description: 'Hero + послуги + форма + банер магазину',
    build: () => [
      newSection('hero'),
      newSection('services-grid'),
      newSection('advantages'),
      newSection('callback'),
      newSection('zone-door'),
    ],
  },
  {
    id: 'service-page',
    label: 'Сторінка послуги',
    description: 'Hero + прайс + запис',
    build: () => [newSection('hero'), newSection('price-list'), newSection('callback')],
  },
  {
    id: 'landing-shop',
    label: 'Лендінг магазину',
    description: 'Hero + сітка товарів + банер салону',
    build: () => [newSection('hero'), newSection('shop-grid'), newSection('zone-door')],
  },
  {
    id: 'contacts-only',
    label: 'Контакти',
    description: 'Контакти + форма дзвінка',
    build: () => [newSection('contacts'), newSection('callback')],
  },
];
