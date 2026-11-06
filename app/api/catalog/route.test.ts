import { describe, expect, it, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/site-data', () => ({
  getProducts: vi.fn(),
}));

import { getProducts } from '@/lib/site-data';
import { GET as getCatalog } from './route';
import { POST as lookupCatalog } from './lookup/route';
import type { Product } from '@/lib/types';

const mockProducts: Product[] = [
  {
    id: 'p1',
    title: 'Шампунь для волосся',
    description: '<p>Чудовий шампунь з кератином</p>',
    price: 300,
    image: '/img/1.webp',
    category: 'Волосся',
    visible: true,
    inStock: true,
    code: 'SH-01',
    badge: 'hit',
  },
  {
    id: 'p2',
    title: 'Крем для обличчя',
    description: '<p>Зволожуючий крем</p>',
    price: 500,
    image: '/img/2.webp',
    category: 'Обличчя',
    visible: true,
    inStock: false,
    code: 'CR-02',
  },
  {
    id: 'p3',
    title: 'Прихований товар',
    description: '<p>Секретний товар</p>',
    price: 999,
    image: '/img/3.webp',
    category: 'Обличчя',
    visible: false, // Hidden! Must never be returned
    inStock: true,
  },
];

describe('GET /api/catalog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getProducts).mockResolvedValue(mockProducts);
  });

  it('returns paginated public card DTOs excluding hidden goods and HTML descriptions', async () => {
    const req = new NextRequest('http://localhost:3000/api/catalog?page=1&pageSize=36');
    const res = await getCatalog(req);
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.total).toBe(2); // Only p1 and p2 (p3 is hidden)
    expect(data.items.length).toBe(2);
    expect(data.hasMore).toBe(false);

    // Verify DTO fields on first item
    const first = data.items[0];
    expect(first.id).toBe('p1');
    expect(first.title).toBe('Шампунь для волосся');
    expect(first.price).toBe(300);
    expect(first.shortDesc).toBe('Чудовий шампунь з кератином');
    expect(first).not.toHaveProperty('description'); // No HTML description in DTO!
  });

  it('filters by category and searches full description', async () => {
    // Search by word in description: "кератином"
    const req = new NextRequest('http://localhost:3000/api/catalog?q=кератином');
    const res = await getCatalog(req);
    const data = await res.json();
    expect(data.items.length).toBe(1);
    expect(data.items[0].id).toBe('p1');

    // Filter by category
    const catReq = new NextRequest('http://localhost:3000/api/catalog?category=Обличчя');
    const catRes = await getCatalog(catReq);
    const catData = await catRes.json();
    expect(catData.items.length).toBe(1);
    expect(catData.items[0].id).toBe('p2');
  });

  it('rejects invalid query parameters with 400', async () => {
    const req = new NextRequest('http://localhost:3000/api/catalog?page=0');
    const res = await getCatalog(req);
    expect(res.status).toBe(400);
  });
});

describe('POST /api/catalog/lookup', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getProducts).mockResolvedValue(mockProducts);
  });

  it('looks up selected IDs returning only visible items', async () => {
    const req = new NextRequest('http://localhost:3000/api/catalog/lookup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: ['p1', 'p3', 'non-existent'] }),
    });

    const res = await lookupCatalog(req);
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.items.length).toBe(1);
    expect(data.items[0].id).toBe('p1');
    expect(data.items[0]).not.toHaveProperty('description');
  });

  it('rejects lookup with more than 50 IDs', async () => {
    const tooMany = Array.from({ length: 51 }, (_, i) => `id-${i}`);
    const req = new NextRequest('http://localhost:3000/api/catalog/lookup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: tooMany }),
    });

    const res = await lookupCatalog(req);
    expect(res.status).toBe(400);
  });
});

