import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { isFavorite, pushRecent, readFavorites, readRecents, toggleFavorite } from './admin-recents';

describe('admin-recents', () => {
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
    // @ts-expect-error mocking window for test
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

  describe('recents', () => {
    it('returns empty array when storage is empty or invalid', () => {
      expect(readRecents()).toEqual([]);

      store['admin-recents-v1'] = 'not-json';
      expect(readRecents()).toEqual([]);

      store['admin-recents-v1'] = JSON.stringify([{ invalid: 'entry' }]);
      expect(readRecents()).toEqual([]);
    });

    it('pushes valid admin hrefs and filters out login or non-admin hrefs', () => {
      pushRecent('/salon', 'Salon Public');
      expect(readRecents()).toHaveLength(0);

      pushRecent('/admin/login', 'Login');
      expect(readRecents()).toHaveLength(0);

      pushRecent('/admin/orders', 'Orders');
      expect(readRecents()).toHaveLength(1);
      expect(readRecents()[0].href).toBe('/admin/orders');
      expect(readRecents()[0].label).toBe('Orders');

      // Pushing same href unshifts and deduplicates
      pushRecent('/admin/leads', 'Leads');
      pushRecent('/admin/orders', 'Orders Updated');
      const recents = readRecents();
      expect(recents).toHaveLength(2);
      expect(recents[0].href).toBe('/admin/orders');
      expect(recents[0].label).toBe('Orders Updated');
    });

    it('caps recents at 12', () => {
      for (let i = 0; i < 15; i++) {
        pushRecent(`/admin/page-${i}`, `Page ${i}`);
      }
      expect(readRecents()).toHaveLength(12);
    });
  });

  describe('favorites', () => {
    it('returns empty array when storage empty or invalid', () => {
      expect(readFavorites()).toEqual([]);

      store['admin-favorites-v1'] = 'invalid-json';
      expect(readFavorites()).toEqual([]);
    });

    it('toggles favorites and checks isFavorite', () => {
      expect(isFavorite('/admin/orders')).toBe(false);

      const afterAdd = toggleFavorite('/admin/orders');
      expect(afterAdd).toContain('/admin/orders');
      expect(isFavorite('/admin/orders')).toBe(true);

      const afterRemove = toggleFavorite('/admin/orders');
      expect(afterRemove).not.toContain('/admin/orders');
      expect(isFavorite('/admin/orders')).toBe(false);
    });

    it('caps favorites at 20', () => {
      for (let i = 0; i < 25; i++) {
        toggleFavorite(`/admin/fav-${i}`);
      }
      expect(readFavorites()).toHaveLength(20);
    });
  });
});
