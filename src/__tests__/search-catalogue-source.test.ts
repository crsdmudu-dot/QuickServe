/**
 * search-catalogue-source.test.ts
 *
 * Phase 4E.1 regression — search suggestions/recommendations must derive from the
 * LIVE DB catalogue (the services list passed in from useServices().services), not
 * the hardcoded SERVICES constant. Previously suggestions read the constant while
 * results read the DB, so suggestions could reference services absent from the live
 * catalogue. Matching behavior is unchanged (title / subtitle / category substring).
 */
import { searchServices, searchSuggestions, noResultRecommendations } from '@/lib/search';
import type { Service } from '@/constants/services';

// A small LIVE catalogue standing in for useServices().services.
const CATALOGUE: Service[] = [
  { id: 'house-cleaning', title: 'House Cleaning', subtitle: 'Tidy home', category: 'home' },
  { id: 'plumbing', title: 'Plumbing', subtitle: 'Leaks & fixtures', category: 'home' },
  { id: 'electrical-repairs', title: 'Electrical Repairs', subtitle: 'Wiring', category: 'home' },
  { id: 'movers-packers', title: 'Movers & Packers', subtitle: 'Relocation', category: 'moving' },
] as Service[];

describe('search suggestions come from the live catalogue (Phase 4E.1)', () => {
  it('suggests ONLY services present in the passed catalogue', () => {
    expect(searchSuggestions(CATALOGUE, 'plumb')).toContain('Plumbing');
    expect(searchSuggestions(CATALOGUE, 'house')).toContain('House Cleaning');
  });

  it('never suggests a service absent from the live catalogue', () => {
    // "Haircut" is not in this catalogue → no suggestion for it.
    expect(searchSuggestions(CATALOGUE, 'haircut')).toEqual([]);
  });

  it('a service removed/hidden from the catalogue disappears from suggestions', () => {
    expect(searchSuggestions(CATALOGUE, 'clean')).toContain('House Cleaning');
    const reduced = CATALOGUE.filter((s) => s.id !== 'house-cleaning');
    expect(searchSuggestions(reduced, 'clean')).not.toContain('House Cleaning');
  });

  it('no-result recommendations only contain live-catalogue services', () => {
    const recs = noResultRecommendations(CATALOGUE);
    expect(recs.length).toBeGreaterThan(0);
    expect(recs.every((r) => CATALOGUE.some((c) => c.id === r.id))).toBe(true);
  });
});

describe('exact service-title search returns the expected service (Phase 4E.1)', () => {
  it.each(['House Cleaning', 'Plumbing', 'Electrical Repairs', 'Movers & Packers'])(
    'typing "%s" surfaces that exact service',
    (title) => {
      const results = searchServices(CATALOGUE, title);
      expect(results.map((s) => s.title)).toContain(title);
    },
  );
});
