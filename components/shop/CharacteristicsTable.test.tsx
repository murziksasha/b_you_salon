import React from 'react';
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { CharacteristicsTable } from './CharacteristicsTable';

describe('CharacteristicsTable', () => {
  it('returns null when raw is empty or contains no colon pairs', () => {
    expect(renderToStaticMarkup(<CharacteristicsTable raw='' />)).toBe('');
    expect(renderToStaticMarkup(<CharacteristicsTable raw='Just plain text without delimiter' />)).toBe('');
    expect(renderToStaticMarkup(<CharacteristicsTable raw=':No label key' />)).toBe('');
  });

  it('renders table rows for valid key: value pairs', () => {
    const raw = ['Обʼєм: 50 мл', 'Країна: Україна'].join('\n');
    const html = renderToStaticMarkup(<CharacteristicsTable raw={raw} />);

    expect(html).toContain('<table class="shop-char-table">');
    expect(html).toContain('<th scope="row">Обʼєм</th>');
    expect(html).toContain('<td>50 мл</td>');
    expect(html).toContain('<th scope="row">Країна</th>');
    expect(html).toContain('<td>Україна</td>');
  });

  it('splits on first colon and trims whitespace', () => {
    const raw = '  Склад :  Вода: 90%, Олія: 10%  ';
    const html = renderToStaticMarkup(<CharacteristicsTable raw={raw} />);

    expect(html).toContain('<th scope="row">Склад</th>');
    expect(html).toContain('<td>Вода: 90%, Олія: 10%</td>');
  });

  it('skips invalid lines while keeping valid lines', () => {
    const raw = ['Valid: Yes', 'Invalid line', '', 'Also: Valid'].join('\n');
    const html = renderToStaticMarkup(<CharacteristicsTable raw={raw} />);

    expect(html).toContain('<th scope="row">Valid</th>');
    expect(html).toContain('<td>Yes</td>');
    expect(html).toContain('<th scope="row">Also</th>');
    expect(html).toContain('<td>Valid</td>');
  });
});
