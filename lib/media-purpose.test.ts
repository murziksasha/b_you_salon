import { describe, expect, it } from 'vitest';
import { isMediaPurpose, purposeFromPreset } from './media-purpose';

describe('media-purpose', () => {
  it('validates purpose ids', () => {
    expect(isMediaPurpose('product')).toBe(true);
    expect(isMediaPurpose('nope')).toBe(false);
  });

  it('maps resize presets', () => {
    expect(purposeFromPreset('product')).toBe('product');
    expect(purposeFromPreset('logo')).toBe('logo');
    expect(purposeFromPreset('hero')).toBe('hero');
    expect(purposeFromPreset('og')).toBe('og');
    expect(purposeFromPreset('default')).toBe('other');
    expect(purposeFromPreset(undefined)).toBe('other');
  });
});
