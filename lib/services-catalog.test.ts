import { describe, expect, it } from 'vitest';
import { formatPriceFrom, servicesByCategory, uniqueServiceSlug } from './services-catalog';
import type { SalonService } from './types';

const services: SalonService[] = [
  {
    id: '1',
    title: 'Манікюр',
    slug: 'manicure',
    category: 'Нігті',
    description: '',
    priceFrom: 500,
    image: '/m.jpg',
    visible: true,
  },
  {
    id: '2',
    title: 'Hidden',
    slug: 'hidden',
    category: 'Нігті',
    description: '',
    priceFrom: 1,
    image: '/h.jpg',
    visible: false,
  },
];

describe('services catalog', () => {
  it('filters visible by category', () => {
    expect(servicesByCategory(services, 'Нігті')).toHaveLength(1);
    expect(formatPriceFrom(500, 'від')).toContain('500');
    expect(formatPriceFrom(0)).toMatch(/уточнюйте/i);
  });

  it('unique slugs', () => {
    expect(uniqueServiceSlug(services, 'manicure')).toBe('manicure-1');
    expect(uniqueServiceSlug(services, 'manicure', '1')).toBe('manicure');
  });
});
