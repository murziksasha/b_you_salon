import { describe, expect, it } from 'vitest';
import { fillTemplate, phoneToDigits, viberChatLink } from './reply-templates';

describe('reply-templates', () => {
  it('fills placeholders', () => {
    const t = fillTemplate('Hi{name}! Call {phone} about{product}.', {
      name: 'Іван',
      phone: '+380671112233',
      product: 'iPhone',
    });
    expect(t).toContain('Іван');
    expect(t).toContain('+380671112233');
    expect(t).toContain('iPhone');
  });

  it('viber link uses digits', () => {
    expect(phoneToDigits('067 111 22 33')).toBe('380671112233');
    expect(viberChatLink('+380671112233')).toContain('380671112233');
  });
});
