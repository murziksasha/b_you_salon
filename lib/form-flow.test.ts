import { describe, expect, it } from 'vitest';
import { parseFormIntent, resolveFormFlow, resolveLeadSource, resolveLeadZone } from './form-flow';

describe('form-flow', () => {
  it('parses intent', () => {
    expect(parseFormIntent('salon')).toBe('salon');
    expect(parseFormIntent('shop')).toBe('shop');
    expect(parseFormIntent('other')).toBe('');
    expect(parseFormIntent('')).toBe('');
    expect(parseFormIntent(undefined)).toBe('');
  });

  it('routes home by intent', () => {
    expect(resolveFormFlow({ pagePath: '/', intent: 'salon' })).toBe('booking');
    expect(resolveFormFlow({ pagePath: '/', intent: 'shop' })).toBe('sales');
    expect(resolveFormFlow({ pagePath: '/', intent: '' })).toBe('callback');
    expect(resolveFormFlow({ pagePath: '/' })).toBe('callback');
  });

  it('routes salon pages to booking without intent', () => {
    expect(resolveFormFlow({ pagePath: '/salon' })).toBe('booking');
    expect(resolveFormFlow({ pagePath: '/salon/manicure' })).toBe('booking');
    expect(resolveFormFlow({ pagePath: '/salon?utm_source=x' })).toBe('booking');
  });

  it('routes shop and cart to sales without intent', () => {
    expect(resolveFormFlow({ pagePath: '/shop' })).toBe('sales');
    expect(resolveFormFlow({ pagePath: '/shop/p1' })).toBe('sales');
    expect(resolveFormFlow({ pagePath: '/cart' })).toBe('sales');
  });

  it('lets intent override path', () => {
    expect(resolveFormFlow({ pagePath: '/salon', intent: 'shop' })).toBe('sales');
    expect(resolveFormFlow({ pagePath: '/shop', intent: 'salon' })).toBe('booking');
  });

  it('maps lead source and zone', () => {
    expect(resolveLeadSource('booking')).toBe('booking');
    expect(resolveLeadSource('callback')).toBe('callback');
    expect(resolveLeadSource('sales')).toBe('callback');
    expect(resolveLeadZone('/', 'salon')).toBe('salon');
    expect(resolveLeadZone('/', 'shop')).toBe('shop');
    expect(resolveLeadZone('/salon/x', '')).toBe('salon');
    expect(resolveLeadZone('/', '')).toBe('home');
  });
});
