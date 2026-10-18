import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  DEFAULT_NOTIFY_PREFS,
  isQuietNow,
  readNotifyPrefs,
  shouldNotify,
  writeNotifyPrefs,
} from './admin-notify-prefs';

describe('admin-notify-prefs', () => {
  const store: Record<string, string> = {};

  const mockLocalStorage = {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, val: string) => {
      store[key] = val;
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      for (const k of Object.keys(store)) delete store[k];
    },
  };

  beforeEach(() => {
    mockLocalStorage.clear();
    globalThis.window = {} as unknown as Window & typeof globalThis;
    // @ts-expect-error mocking localStorage for test
    globalThis.localStorage = mockLocalStorage;
  });

  afterEach(() => {
    // @ts-expect-error cleanup window
    delete globalThis.window;
    // @ts-expect-error cleanup localStorage
    delete globalThis.localStorage;
  });

  it('reads default preferences when storage empty', () => {
    expect(readNotifyPrefs()).toEqual(DEFAULT_NOTIFY_PREFS);
  });

  it('writes and reads custom preferences', () => {
    const custom = { ...DEFAULT_NOTIFY_PREFS, mute: true, quietStart: 23, quietEnd: 7 };
    writeNotifyPrefs(custom);
    expect(readNotifyPrefs()).toEqual(custom);
  });

  it('handles daytime quiet hours (quietStart < quietEnd)', () => {
    const prefs = { ...DEFAULT_NOTIFY_PREFS, quietStart: 13, quietEnd: 15 };
    expect(isQuietNow(prefs, new Date(2026, 0, 1, 14, 0))).toBe(true);
    expect(isQuietNow(prefs, new Date(2026, 0, 1, 16, 0))).toBe(false);
  });

  it('quiet overnight window (quietStart > quietEnd)', () => {
    const prefs = { ...DEFAULT_NOTIFY_PREFS, quietStart: 22, quietEnd: 8 };
    expect(isQuietNow(prefs, new Date(2026, 0, 1, 23, 0))).toBe(true);
    expect(isQuietNow(prefs, new Date(2026, 0, 1, 7, 0))).toBe(true);
    expect(isQuietNow(prefs, new Date(2026, 0, 1, 12, 0))).toBe(false);
  });

  it('mute blocks all notifications', () => {
    const prefs = { ...DEFAULT_NOTIFY_PREFS, mute: true };
    expect(shouldNotify(prefs, 'order')).toBe(false);
  });

  it('ordersOnly skips leads', () => {
    const prefs = { ...DEFAULT_NOTIFY_PREFS, ordersOnly: true, quietStart: 0, quietEnd: 0 };
    expect(shouldNotify(prefs, 'lead', new Date(2026, 0, 1, 12))).toBe(false);
    expect(shouldNotify(prefs, 'order', new Date(2026, 0, 1, 12))).toBe(true);
  });
});
