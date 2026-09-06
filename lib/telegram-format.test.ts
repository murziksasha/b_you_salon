import { describe, expect, it } from 'vitest';
import {
  clampListCount,
  chunkTelegramText,
  formatLeadPush,
  formatOrderPush,
  formatPhoneMovements,
} from './telegram-format';

describe('telegram-format', () => {
  it('formats booking and sale pushes', () => {
    const lead = formatLeadPush({
      phone: '+380501112233',
      source: 'booking',
      serviceTitle: 'Манікюр',
      comment: 'після 18:00',
      createdAt: '2026-09-06T11:32:00.000Z',
    });
    expect(lead.startsWith('Запис')).toBe(true);
    expect(lead).toContain('+380501112233');
    expect(lead).toContain('Манікюр');
    expect(lead).toContain('після 18:00');

    const cb = formatLeadPush({ phone: '+380501112233', source: 'callback' });
    expect(cb.startsWith('Заявка')).toBe(true);

    const sale = formatOrderPush({
      phone: '+380671112233',
      productTitle: 'Шампунь',
      price: 1200,
      comment: 'самовивіз',
      createdAt: '2026-09-06T11:32:00.000Z',
    });
    expect(sale.startsWith('Продаж')).toBe(true);
    expect(sale).toContain('+380671112233');
    expect(sale).toContain('Шампунь');
    expect(sale).toContain('самовивіз');
  });

  it('clamps list counts and chunks long text', () => {
    expect(clampListCount(undefined)).toBe(10);
    expect(clampListCount(0)).toBe(1);
    expect(clampListCount(500)).toBe(50);
    expect(clampListCount('25')).toBe(25);
    const chunks = chunkTelegramText('a'.repeat(5000), 1000);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.join('').length).toBe(5000);
  });

  it('formats phone movement timeline', () => {
    const text = formatPhoneMovements('+38050', [
      { kind: 'order', at: '2026-09-06T10:00:00.000Z', detail: 'Шампунь' },
      { kind: 'booking', at: '2026-09-01T10:00:00.000Z', detail: 'Фарбування' },
    ]);
    expect(text).toContain('Усі рухи +38050');
    expect(text).toContain('Продаж');
    expect(text).toContain('Запис');
    expect(formatPhoneMovements('+38050', [])).toMatch(/Нічого не знайдено/);
  });
});
