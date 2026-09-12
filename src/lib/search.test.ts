// search.test.ts — Tests for src/lib/search.ts
// AsyncStorage is mocked globally via test/setup.ts (official mock).

import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  getRecentSearches,
  addRecentSearch,
  clearRecentSearches,
  MAX_RECENT_SEARCHES,
  searchServices,
  searchSuggestions,
  noResultRecommendations,
} from '@/lib/search';

// ── Helpers ────────────────────────────────────────────────────────────────

/** Reset the AsyncStorage mock internal store between tests. */
beforeEach(async () => {
  await AsyncStorage.clear();
  jest.clearAllMocks();
});

// ── getRecentSearches ──────────────────────────────────────────────────────

describe('getRecentSearches', () => {
  it('returns [] when storage is empty', async () => {
    const result = await getRecentSearches();
    expect(result).toEqual([]);
  });

  it('returns [] on corrupt / non-array JSON', async () => {
    await AsyncStorage.setItem('qs.recentSearches', 'not-json{{{');
    const result = await getRecentSearches();
    expect(result).toEqual([]);
  });

  it('returns [] when stored value is a non-array JSON', async () => {
    await AsyncStorage.setItem('qs.recentSearches', JSON.stringify({ foo: 'bar' }));
    const result = await getRecentSearches();
    expect(result).toEqual([]);
  });

  it('returns the stored array when valid', async () => {
    await AsyncStorage.setItem('qs.recentSearches', JSON.stringify(['Plumber', 'AC Repair']));
    const result = await getRecentSearches();
    expect(result).toEqual(['Plumber', 'AC Repair']);
  });
});

// ── addRecentSearch ────────────────────────────────────────────────────────

describe('addRecentSearch', () => {
  it('adds a new term to an empty list', async () => {
    await addRecentSearch('Cleaning');
    expect(await getRecentSearches()).toEqual(['Cleaning']);
  });

  it('prepends new terms (newest-first)', async () => {
    await addRecentSearch('Cleaning');
    await addRecentSearch('Plumber');
    expect(await getRecentSearches()).toEqual(['Plumber', 'Cleaning']);
  });

  it('ignores empty string', async () => {
    await addRecentSearch('');
    expect(await getRecentSearches()).toEqual([]);
  });

  it('ignores whitespace-only string', async () => {
    await addRecentSearch('   ');
    expect(await getRecentSearches()).toEqual([]);
  });

  it('de-duplicates case-insensitively (moves existing to front)', async () => {
    await addRecentSearch('Cleaning');
    await addRecentSearch('Plumber');
    // Adding "cleaning" (lowercase) should move it to front and remove old entry
    await addRecentSearch('cleaning');
    const result = await getRecentSearches();
    expect(result[0]).toBe('cleaning');
    // The old "Cleaning" entry is gone — list has no duplicates
    expect(result.filter((t) => t.toLowerCase() === 'cleaning')).toHaveLength(1);
  });

  it('caps the list at MAX_RECENT_SEARCHES (8)', async () => {
    for (let i = 1; i <= 10; i++) {
      await addRecentSearch(`Term ${i}`);
    }
    const result = await getRecentSearches();
    expect(result).toHaveLength(MAX_RECENT_SEARCHES);
    // Newest terms should be at the front
    expect(result[0]).toBe('Term 10');
    expect(result[1]).toBe('Term 9');
  });

  it('trims whitespace from the stored term', async () => {
    await addRecentSearch('  Movers  ');
    expect(await getRecentSearches()).toEqual(['Movers']);
  });
});

// ── clearRecentSearches ────────────────────────────────────────────────────

describe('clearRecentSearches', () => {
  it('removes all recent searches', async () => {
    await addRecentSearch('Cleaning');
    await addRecentSearch('Plumber');
    await clearRecentSearches();
    expect(await getRecentSearches()).toEqual([]);
  });

  it('is safe to call when storage is already empty', async () => {
    await expect(clearRecentSearches()).resolves.toBeUndefined();
    expect(await getRecentSearches()).toEqual([]);
  });
});

// ── searchServices ─────────────────────────────────────────────────────────
// searchServices now takes (services: Service[], query: string) — updated in Slice 35 Task 5.
// Pass SERVICES from the constants module so tests exercise the same list as before.

import { SERVICES } from '@/constants/services';

describe('searchServices', () => {
  it('returns [] for empty query', () => {
    expect(searchServices(SERVICES, '')).toEqual([]);
  });

  it('returns [] for whitespace-only query', () => {
    expect(searchServices(SERVICES, '   ')).toEqual([]);
  });

  it('matches by title (case-insensitive)', () => {
    const result = searchServices(SERVICES, 'plumbing');
    expect(result.some((s) => s.id === 'plumbing')).toBe(true);
  });

  it('matches by subtitle (case-insensitive)', () => {
    // "Leaks, fittings & repairs" is the subtitle for plumbing
    const result = searchServices(SERVICES, 'leaks');
    expect(result.some((s) => s.id === 'plumbing')).toBe(true);
  });

  it('matches by category label (case-insensitive)', () => {
    // "Home Services" is the category label for 'home'
    const result = searchServices(SERVICES, 'home services');
    expect(result.length).toBeGreaterThan(0);
    for (const s of result) {
      expect(s.category).toBe('home');
    }
  });

  it('is case-insensitive for title match', () => {
    const upper = searchServices(SERVICES, 'MASSAGE');
    const lower = searchServices(SERVICES, 'massage');
    expect(upper.map((s) => s.id)).toEqual(lower.map((s) => s.id));
  });

  it('preserves SERVICES order among matches', () => {
    // "delivery" matches multiple services by category label
    const result = searchServices(SERVICES, 'delivery');
    const ids = result.map((s) => s.id);
    // grocery-delivery and food-delivery should both appear, grocery first
    const groceryIdx = ids.indexOf('grocery-delivery');
    const foodIdx = ids.indexOf('food-delivery');
    if (groceryIdx !== -1 && foodIdx !== -1) {
      expect(groceryIdx).toBeLessThan(foodIdx);
    }
  });

  it('returns multiple results for a broad query', () => {
    const result = searchServices(SERVICES, 'repair');
    expect(result.length).toBeGreaterThan(1);
  });

  it('returns [] for a query that matches nothing', () => {
    expect(searchServices(SERVICES, 'zzzyyyxxx')).toEqual([]);
  });

  it('searches only the supplied list (custom services)', () => {
    const custom = [
      { id: 'yoga-classes', title: 'Yoga Classes', icon: '🧘', category: 'personal' as const },
    ];
    const result = searchServices(custom, 'yoga');
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('yoga-classes');
    // Passing SERVICES (which lacks yoga-classes) returns nothing
    expect(searchServices(SERVICES, 'yoga')).toHaveLength(0);
  });
});

// ── searchSuggestions ─────────────────────────────────────────────────────

describe('searchSuggestions', () => {
  it('returns [] for empty query', () => {
    expect(searchSuggestions(SERVICES, '')).toEqual([]);
  });

  it('returns [] for whitespace-only query', () => {
    expect(searchSuggestions(SERVICES, '   ')).toEqual([]);
  });

  it('returns suggestion strings for a matching title query', () => {
    const result = searchSuggestions(SERVICES, 'clean');
    expect(result.length).toBeGreaterThan(0);
    expect(result.every((s) => typeof s === 'string')).toBe(true);
  });

  it('returns no more than 6 suggestions', () => {
    // A broad query like "a" should match many things but we cap at 6
    const result = searchSuggestions(SERVICES, 'a');
    expect(result.length).toBeLessThanOrEqual(6);
  });

  it('de-dupes suggestions', () => {
    const result = searchSuggestions(SERVICES, 'delivery');
    const unique = new Set(result.map((s) => s.toLowerCase()));
    expect(unique.size).toBe(result.length);
  });

  it('returns [] for a query matching nothing', () => {
    expect(searchSuggestions(SERVICES, 'zzzyyyxxx')).toEqual([]);
  });
});

// ── noResultRecommendations ────────────────────────────────────────────────

describe('noResultRecommendations', () => {
  it('returns a non-empty array', () => {
    const result = noResultRecommendations(SERVICES);
    expect(result.length).toBeGreaterThan(0);
  });

  it('returns no more than 6 services', () => {
    const result = noResultRecommendations(SERVICES);
    expect(result.length).toBeLessThanOrEqual(6);
  });

  it('contains no duplicate service ids', () => {
    const result = noResultRecommendations(SERVICES);
    const ids = result.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('returns valid Service objects', () => {
    const result = noResultRecommendations(SERVICES);
    for (const svc of result) {
      expect(typeof svc.id).toBe('string');
      expect(typeof svc.title).toBe('string');
    }
  });
});
