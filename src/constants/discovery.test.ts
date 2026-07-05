// discovery.test.ts — Tests for src/constants/discovery.ts
// Verifies static constants and resolution functions.

import {
  FEATURED_SERVICE_IDS,
  TRENDING_SERVICE_IDS,
  POPULAR_SEARCHES,
  PROVIDER_SORTS,
  PROVIDER_FILTERS,
  getFeaturedServices,
  getTrendingServices,
  type ProviderSortKey,
  type ProviderFilterKey,
} from '@/constants/discovery';
import { SERVICES } from '@/constants/services';

const ALL_SERVICE_IDS = new Set(SERVICES.map((s) => s.id));

// ── FEATURED_SERVICE_IDS ───────────────────────────────────────────────────

describe('FEATURED_SERVICE_IDS', () => {
  it('is non-empty', () => {
    expect(FEATURED_SERVICE_IDS.length).toBeGreaterThan(0);
  });

  it('all ids resolve to real SERVICES entries (no dangling ids)', () => {
    for (const id of FEATURED_SERVICE_IDS) {
      expect(ALL_SERVICE_IDS.has(id)).toBe(true);
    }
  });

  it('has no duplicate ids', () => {
    expect(new Set(FEATURED_SERVICE_IDS).size).toBe(FEATURED_SERVICE_IDS.length);
  });
});

// ── TRENDING_SERVICE_IDS ───────────────────────────────────────────────────

describe('TRENDING_SERVICE_IDS', () => {
  it('is non-empty', () => {
    expect(TRENDING_SERVICE_IDS.length).toBeGreaterThan(0);
  });

  it('all ids resolve to real SERVICES entries (no dangling ids)', () => {
    for (const id of TRENDING_SERVICE_IDS) {
      expect(ALL_SERVICE_IDS.has(id)).toBe(true);
    }
  });

  it('has no duplicate ids', () => {
    expect(new Set(TRENDING_SERVICE_IDS).size).toBe(TRENDING_SERVICE_IDS.length);
  });
});

// ── getFeaturedServices ────────────────────────────────────────────────────

describe('getFeaturedServices', () => {
  it('returns an array of Service objects', () => {
    const result = getFeaturedServices();
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBe(FEATURED_SERVICE_IDS.length);
  });

  it('returns services in FEATURED_SERVICE_IDS order', () => {
    const result = getFeaturedServices();
    expect(result.map((s) => s.id)).toEqual(FEATURED_SERVICE_IDS);
  });

  it('each returned item is a valid Service with required fields', () => {
    const result = getFeaturedServices();
    for (const svc of result) {
      expect(typeof svc.id).toBe('string');
      expect(typeof svc.title).toBe('string');
      expect(typeof svc.icon).toBe('string');
      expect(['home', 'auto', 'delivery', 'personal']).toContain(svc.category);
    }
  });
});

// ── getTrendingServices ────────────────────────────────────────────────────

describe('getTrendingServices', () => {
  it('returns an array of Service objects', () => {
    const result = getTrendingServices();
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBe(TRENDING_SERVICE_IDS.length);
  });

  it('returns services in TRENDING_SERVICE_IDS order', () => {
    const result = getTrendingServices();
    expect(result.map((s) => s.id)).toEqual(TRENDING_SERVICE_IDS);
  });

  it('each returned item is a valid Service with required fields', () => {
    const result = getTrendingServices();
    for (const svc of result) {
      expect(typeof svc.id).toBe('string');
      expect(typeof svc.title).toBe('string');
      expect(typeof svc.icon).toBe('string');
      expect(['home', 'auto', 'delivery', 'personal']).toContain(svc.category);
    }
  });
});

// ── POPULAR_SEARCHES ───────────────────────────────────────────────────────

describe('POPULAR_SEARCHES', () => {
  it('is non-empty', () => {
    expect(POPULAR_SEARCHES.length).toBeGreaterThan(0);
  });

  it('contains string values only', () => {
    for (const term of POPULAR_SEARCHES) {
      expect(typeof term).toBe('string');
      expect(term.trim().length).toBeGreaterThan(0);
    }
  });
});

// ── PROVIDER_SORTS ─────────────────────────────────────────────────────────

describe('PROVIDER_SORTS', () => {
  const EXPECTED_KEYS: ProviderSortKey[] = [
    'highest_rated',
    'most_jobs',
    'fastest_response',
    'recently_active',
    'alphabetical',
  ];

  it('contains exactly 5 entries', () => {
    expect(PROVIDER_SORTS).toHaveLength(5);
  });

  it('contains all 5 required ProviderSortKey values', () => {
    const ids = PROVIDER_SORTS.map((s) => s.id);
    for (const key of EXPECTED_KEYS) {
      expect(ids).toContain(key);
    }
  });

  it('each entry has a non-empty label', () => {
    for (const sort of PROVIDER_SORTS) {
      expect(typeof sort.label).toBe('string');
      expect(sort.label.trim().length).toBeGreaterThan(0);
    }
  });
});

// ── PROVIDER_FILTERS ───────────────────────────────────────────────────────

describe('PROVIDER_FILTERS', () => {
  const EXPECTED_KEYS: ProviderFilterKey[] = [
    'rating',
    'availability',
    'verified_only',
    'category',
    'service',
    'favorites',
    'recently_used',
  ];

  it('contains exactly 7 entries', () => {
    expect(PROVIDER_FILTERS).toHaveLength(7);
  });

  it('contains all 7 required ProviderFilterKey values', () => {
    const ids = PROVIDER_FILTERS.map((f) => f.id);
    for (const key of EXPECTED_KEYS) {
      expect(ids).toContain(key);
    }
  });

  it('each entry has a non-empty label', () => {
    for (const filter of PROVIDER_FILTERS) {
      expect(typeof filter.label).toBe('string');
      expect(filter.label.trim().length).toBeGreaterThan(0);
    }
  });
});
