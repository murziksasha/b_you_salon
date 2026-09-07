import { describe, expect, it } from 'vitest';
import {
  clampListCount,
  chunkTelegramText,
  formatLeadListItem,
  formatLeadPush,
  formatOrderPush,
  formatPhoneMovements,
  pushActionKeyboard,
  stripCopyTextButtons,
} from './telegram-format';
import type { Lead } from './leads';

describe('telegram-format', () => {
  it('formats booking and sale pushes with masked phone and status', () => {
    const lead = formatLeadPush({
      phone: '+380501112233',
      source: 'booking',
      serviceTitle: 'Манікюр',
      comment: 'після 18:00',
      createdAt: '2026-09-06T11:32:00.000Z',
      status: 'new',
    });
    expect(lead.startsWith('Запис')).toBe(true);
    expect(lead).toContain('+38050***33');
    expect(lead).not.toContain('+380501112233');
    expect(lead).toContain('Статус: Нова');
    expect(lead).toContain('Манікюр');
    expect(lead).toContain('після 18:00');

    const cb = formatLeadPush({
      phone: '+380501112233',
      source: 'callback',
      status: 'in_progress',
      assignee: 'Ira',
    });
    expect(cb.startsWith('Заявка')).toBe(true);
    expect(cb).toContain('В роботі');
    expect(cb).toContain('Відповідальний: Ira');

    const sale = formatOrderPush({
      phone: '+380671112233',
      productTitle: 'Шампунь',
      price: 1200,
      comment: 'самовивіз',
      createdAt: '2026-09-06T11:32:00.000Z',
    });
    expect(sale.startsWith('Продаж')).toBe(true);
    expect(sale).toContain('+38067***33');
    expect(sale).not.toContain('671112233');
    expect(sale).toContain('Шампунь');
    expect(sale).toContain('самовивіз');

    const consult = formatOrderPush({
      phone: '+380671112233',
      productTitle: 'Консультація по товарах',
      createdAt: '2026-09-06T11:32:00.000Z',
    });
    expect(consult.startsWith('Продаж')).toBe(true);
    expect(consult).toContain('Консультація по товарах');
    expect(consult).not.toContain('Сума:');
    expect(consult).not.toContain('Самовивіз');
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

  it('lists masked phones and search keeps the full number', () => {
    const lead = {
      id: 'l1',
      phone: '+380671234512',
      createdAt: '2026-09-06T10:00:00.000Z',
      source: 'booking',
      emailed: false,
      handled: false,
      status: 'in_progress',
      assignee: 'Oksana',
      serviceTitle: 'Брови',
    } as Lead;
    const row = formatLeadListItem(lead, 1);
    expect(row).toContain('+38067***12');
    expect(row).not.toContain('12345');
    expect(row).toContain('В роботі');
    expect(row).toContain('Oksana');

    const found = formatPhoneMovements('+380671234512', [
      { kind: 'booking', at: '2026-09-06T10:00:00.000Z', status: 'new', detail: 'Брови' },
    ]);
    expect(found).toContain('+380671234512');
    expect(found).toContain('Статус: Нова');
  });

  it('builds copy / viber / admin / claim buttons', () => {
    const kb = pushActionKeyboard({
      phone: '+380671234512',
      siteUrl: 'https://beyou.example',
      viberUrl: 'https://beyou.example/r/viber?p=1',
      claim: { kind: 'lead', id: 'abc123' },
    });
    const flat = kb.inline_keyboard?.flat() || [];
    expect(flat.some((b) => b.copy_text?.text === '+380671234512')).toBe(true);
    expect(flat.some((b) => b.text === 'Viber' && b.url)).toBe(true);
    expect(flat.some((b) => b.url?.includes('/admin/clients?phone='))).toBe(true);
    expect(flat.some((b) => b.callback_data === 'claim:ask:l:abc123')).toBe(true);
    expect(stripCopyTextButtons(kb)?.inline_keyboard?.flat().some((b) => b.copy_text)).toBeFalsy();
  });
});
