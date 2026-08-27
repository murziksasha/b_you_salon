import { describe, expect, it } from 'vitest';
import { DEFAULT_NOTIFY_PREFS, isQuietNow, shouldNotify } from './admin-notify-prefs';

describe('admin-notify-prefs', () => {
  it('quiet overnight window', () => {
    const prefs = { ...DEFAULT_NOTIFY_PREFS, quietStart: 22, quietEnd: 8 };
    expect(isQuietNow(prefs, new Date(2026, 0, 1, 23, 0))).toBe(true);
    expect(isQuietNow(prefs, new Date(2026, 0, 1, 7, 0))).toBe(true);
    expect(isQuietNow(prefs, new Date(2026, 0, 1, 12, 0))).toBe(false);
  });

  it('mute blocks all', () => {
    const prefs = { ...DEFAULT_NOTIFY_PREFS, mute: true };
    expect(shouldNotify(prefs, 'order')).toBe(false);
  });

  it('ordersOnly skips leads', () => {
    const prefs = { ...DEFAULT_NOTIFY_PREFS, ordersOnly: true, quietStart: 0, quietEnd: 0 };
    // quietStart===quietEnd disables quiet
    expect(shouldNotify(prefs, 'lead', new Date(2026, 0, 1, 12))).toBe(false);
    expect(shouldNotify(prefs, 'order', new Date(2026, 0, 1, 12))).toBe(true);
  });
});
