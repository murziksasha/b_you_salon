import { describe, expect, it } from 'vitest';
import {
  fillTemplate,
  phoneToDigits,
  telegramAppShareLink,
  telegramWebShareLink,
  viberChatLink,
} from './reply-templates';

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

  it('telegram app link is tg:// with text', () => {
    const href = telegramAppShareLink('Привіт');
    expect(href.startsWith('tg://msg?text=')).toBe(true);
    expect(href).toContain(encodeURIComponent('Привіт'));
  });

  it('telegram web share never has empty url', () => {
    const href = telegramWebShareLink('Текст шаблону', 'https://example.com');
    expect(href).toContain('https://t.me/share/url?');
    expect(href).toContain(encodeURIComponent('https://example.com'));
    expect(href).toContain(encodeURIComponent('Текст шаблону'));
    expect(href).not.toContain('url=&');
    expect(telegramWebShareLink('x', '  ')).toContain(encodeURIComponent('https://t.me'));
  });
});
