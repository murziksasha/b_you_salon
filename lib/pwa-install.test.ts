import { describe, expect, it } from 'vitest';
import { isIosDevice, isPwaDismissed, isStandaloneMode, PWA_DISMISS_KEY } from './pwa-install';

describe('lib/pwa-install', () => {
  it('detects standalone mode from navigator.standalone or display-mode', () => {
    expect(isStandaloneMode(undefined)).toBe(false);
    expect(isStandaloneMode({})).toBe(false);

    expect(isStandaloneMode({ navigator: { standalone: true } })).toBe(true);
    expect(isStandaloneMode({ navigator: { standalone: false } })).toBe(false);

    const matchMediaTrue = (query: string) => ({ matches: query.includes('standalone') });
    expect(isStandaloneMode({ matchMedia: matchMediaTrue })).toBe(true);

    const matchMediaFalse = () => ({ matches: false });
    expect(isStandaloneMode({ matchMedia: matchMediaFalse })).toBe(false);
  });

  it('detects iOS devices accurately', () => {
    expect(isIosDevice('')).toBe(false);
    expect(
      isIosDevice(
        'Mozilla/5.0 (iPhone; CPU iPhone OS 16_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.5 Mobile/15E148 Safari/604.1',
      ),
    ).toBe(true);
    expect(
      isIosDevice(
        'Mozilla/5.0 (iPad; CPU OS 16_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.5 Mobile/15E148 Safari/604.1',
      ),
    ).toBe(true);
    // iPadOS 13+ desktop-class UA
    expect(
      isIosDevice(
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.5 Safari/605.1.15',
        5,
      ),
    ).toBe(true);
    // Normal desktop Mac (0 or 1 touch point)
    expect(
      isIosDevice(
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.5 Safari/605.1.15',
        0,
      ),
    ).toBe(false);
    // Android device
    expect(
      isIosDevice(
        'Mozilla/5.0 (Linux; Android 13; SM-S901B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/112.0.0.0 Mobile Safari/537.36',
      ),
    ).toBe(false);
  });

  it('checks dismissal key correctly', () => {
    expect(PWA_DISMISS_KEY).toBe('byou-pwa-install-dismissed');
    expect(isPwaDismissed(null)).toBe(false);
    expect(isPwaDismissed('')).toBe(false);
    expect(isPwaDismissed('0')).toBe(false);
    expect(isPwaDismissed('1')).toBe(true);
    expect(isPwaDismissed('true')).toBe(true);
  });
});

