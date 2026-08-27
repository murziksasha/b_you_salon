import { describe, expect, it } from 'vitest';
import {
  formatTelHref,
  isValidUaPhone,
  normalizePhoneCanonical,
  phoneDigits,
  phonesMatch,
} from './phone';

describe('phone', () => {
  it('extracts digits', () => {
    expect(phoneDigits('+38 (099) 538 56 55')).toBe('380995385655');
  });

  it('validates full UA number', () => {
    expect(isValidUaPhone('+38 (099) 538 56 55')).toBe(true);
    expect(isValidUaPhone('0995385655')).toBe(true);
    expect(isValidUaPhone('380995385655')).toBe(true);
  });

  it('rejects incomplete and arbitrary 9-digit numbers', () => {
    expect(isValidUaPhone('+38 (099)')).toBe(false);
    expect(isValidUaPhone('')).toBe(false);
    expect(isValidUaPhone('abc')).toBe(false);
    expect(isValidUaPhone('123456789')).toBe(false);
    expect(isValidUaPhone('995385655')).toBe(false);
  });

  it('builds tel href', () => {
    expect(formatTelHref('+380995385655')).toBe('tel:+380995385655');
    expect(formatTelHref('099 538 56 55')).toBe('tel:+380995385655');
    expect(formatTelHref('tel:+380995385655')).toBe('tel:+380995385655');
  });

  it('normalizes to +380…', () => {
    expect(normalizePhoneCanonical('0995385655')).toBe('+380995385655');
    expect(normalizePhoneCanonical('+38 (099) 538-56-55')).toBe('+380995385655');
  });

  it('matches equivalent phones', () => {
    expect(phonesMatch('0995385655', '+380995385655')).toBe(true);
    expect(phonesMatch('0991111111', '0992222222')).toBe(false);
  });
});
