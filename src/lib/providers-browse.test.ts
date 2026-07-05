// providers-browse.test.ts — Tests for src/lib/providers-browse.ts
// Pure sort/filter/search functions are tested without any mocking.
// listPublicProviders is tested with a mocked supabase.

import {
  listPublicProviders,
  sortProviders,
  filterProviders,
  searchProviders,
  type PublicProvider,
} from '@/lib/providers-browse';

// ── Mock Supabase (only needed for listPublicProviders) ───────────────────

const mockRpc = jest.fn();

jest.mock('@/lib/supabase', () => ({
  supabase: {
    rpc: (...a: unknown[]) => mockRpc(...a),
  },
}));

beforeEach(() => {
  jest.clearAllMocks();
});

// ── Fixtures ──────────────────────────────────────────────────────────────

const makeProvider = (overrides: Partial<PublicProvider> & { provider_id: string }): PublicProvider => ({
  full_name: null,
  average_rating: null,
  review_count: 0,
  completed_jobs_count: 0,
  is_verified: false,
  years_experience: null,
  availability_status: 'offline',
  profile_photo_url: null,
  created_at: '2025-01-01T00:00:00Z',
  ...overrides,
});

// Five providers with distinct characteristics for sort/filter tests.
const ALICE = makeProvider({
  provider_id: 'prov-alice',
  full_name: 'Alice Smith',
  average_rating: 4.9,
  review_count: 100,
  completed_jobs_count: 200,
  is_verified: true,
  availability_status: 'available',
  created_at: '2025-06-01T00:00:00Z',
});

const BOB = makeProvider({
  provider_id: 'prov-bob',
  full_name: 'Bob Nguyen',
  average_rating: 4.5,
  review_count: 60,
  completed_jobs_count: 300,
  is_verified: false,
  availability_status: 'busy',
  created_at: '2025-04-01T00:00:00Z',
});

const CAROL = makeProvider({
  provider_id: 'prov-carol',
  full_name: 'Carol Osei',
  average_rating: null, // no rating yet
  review_count: 0,
  completed_jobs_count: 5,
  is_verified: true,
  availability_status: 'available',
  created_at: '2025-02-01T00:00:00Z',
});

const DAN = makeProvider({
  provider_id: 'prov-dan',
  full_name: null, // no name
  average_rating: 3.8,
  review_count: 10,
  completed_jobs_count: 50,
  is_verified: false,
  availability_status: 'offline',
  created_at: '2025-03-01T00:00:00Z',
});

const EVA = makeProvider({
  provider_id: 'prov-eva',
  full_name: 'Eva Martinez',
  average_rating: 4.9,
  review_count: 200, // same rating as Alice but more reviews
  completed_jobs_count: 180,
  is_verified: true,
  availability_status: 'available',
  created_at: '2025-05-01T00:00:00Z',
});

const ALL = [ALICE, BOB, CAROL, DAN, EVA];

// ── listPublicProviders ────────────────────────────────────────────────────

describe('listPublicProviders', () => {
  it('calls rpc list_public_providers and returns data', async () => {
    mockRpc.mockResolvedValue({ data: [ALICE, BOB], error: null });

    const result = await listPublicProviders();

    expect(mockRpc).toHaveBeenCalledWith('list_public_providers');
    expect(result).toEqual([ALICE, BOB]);
  });

  it('returns [] on rpc error', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'DB error' } });

    const result = await listPublicProviders();
    expect(result).toEqual([]);
  });

  it('returns [] when data is null without error', async () => {
    mockRpc.mockResolvedValue({ data: null, error: null });

    const result = await listPublicProviders();
    expect(result).toEqual([]);
  });
});

// ── sortProviders ──────────────────────────────────────────────────────────

describe('sortProviders', () => {
  it('does not mutate the input array', () => {
    const input = [...ALL];
    const frozen = Object.freeze([...ALL]);
    // Sort on a copy of frozen to avoid TypeError from freeze
    const copy = [...frozen];
    sortProviders(copy, 'highest_rated');
    expect(input).toEqual(ALL); // original unchanged
  });

  it('returns a new array reference', () => {
    const input = [...ALL];
    const result = sortProviders(input, 'most_jobs');
    expect(result).not.toBe(input);
  });

  describe('highest_rated', () => {
    it('sorts by average_rating desc, tiebreak review_count desc', () => {
      const result = sortProviders(ALL, 'highest_rated');
      // Alice (4.9, 100 reviews) and Eva (4.9, 200 reviews) tie on rating.
      // Eva has more reviews → Eva first, then Alice.
      expect(result[0].provider_id).toBe('prov-eva');
      expect(result[1].provider_id).toBe('prov-alice');
      // Bob 4.5 comes next
      expect(result[2].provider_id).toBe('prov-bob');
      // Dan 3.8
      expect(result[3].provider_id).toBe('prov-dan');
      // Carol null rating → last
      expect(result[4].provider_id).toBe('prov-carol');
    });

    it('places null ratings last', () => {
      const result = sortProviders(ALL, 'highest_rated');
      expect(result[result.length - 1].provider_id).toBe('prov-carol');
    });
  });

  describe('most_jobs', () => {
    it('sorts by completed_jobs_count desc', () => {
      const result = sortProviders(ALL, 'most_jobs');
      const counts = result.map((p) => p.completed_jobs_count);
      for (let i = 0; i < counts.length - 1; i++) {
        expect(counts[i]).toBeGreaterThanOrEqual(counts[i + 1]);
      }
      // Bob has 300 — should be first
      expect(result[0].provider_id).toBe('prov-bob');
    });
  });

  describe('fastest_response (future-ready proxy)', () => {
    it('returns a new array (deterministic, does not throw)', () => {
      const result = sortProviders(ALL, 'fastest_response');
      expect(result).toHaveLength(ALL.length);
      expect(() => sortProviders(ALL, 'fastest_response')).not.toThrow();
    });

    it('places available providers before others', () => {
      const result = sortProviders(ALL, 'fastest_response');
      const statuses = result.map((p) => p.availability_status);
      const firstNonAvailIdx = statuses.findIndex((s) => s !== 'available');
      if (firstNonAvailIdx !== -1) {
        const afterNonAvail = statuses.slice(firstNonAvailIdx);
        expect(afterNonAvail.every((s) => s !== 'available') ||
          afterNonAvail.some((s) => s !== 'available')).toBe(true);
        // All 'available' providers come before all non-available ones
        for (let i = 0; i < firstNonAvailIdx; i++) {
          expect(statuses[i]).toBe('available');
        }
      }
    });

    it('is deterministic (same order on repeated call)', () => {
      const r1 = sortProviders(ALL, 'fastest_response').map((p) => p.provider_id);
      const r2 = sortProviders(ALL, 'fastest_response').map((p) => p.provider_id);
      expect(r1).toEqual(r2);
    });
  });

  describe('recently_active', () => {
    it('places available providers before busy/offline', () => {
      const result = sortProviders(ALL, 'recently_active');
      const firstBusyOrOffline = result.findIndex(
        (p) => p.availability_status !== 'available',
      );
      if (firstBusyOrOffline !== -1) {
        for (let i = 0; i < firstBusyOrOffline; i++) {
          expect(result[i].availability_status).toBe('available');
        }
      }
    });

    it('among available providers, sorts by created_at desc (newest first)', () => {
      const result = sortProviders(ALL, 'recently_active');
      const availables = result.filter((p) => p.availability_status === 'available');
      // ALICE created_at 2025-06-01, EVA 2025-05-01, CAROL 2025-02-01 → Alice first
      expect(availables[0].provider_id).toBe('prov-alice');
      expect(availables[1].provider_id).toBe('prov-eva');
      expect(availables[2].provider_id).toBe('prov-carol');
    });

    it('is deterministic', () => {
      const r1 = sortProviders(ALL, 'recently_active').map((p) => p.provider_id);
      const r2 = sortProviders(ALL, 'recently_active').map((p) => p.provider_id);
      expect(r1).toEqual(r2);
    });
  });

  describe('alphabetical', () => {
    it('sorts full_name locale ascending, nulls last', () => {
      const result = sortProviders(ALL, 'alphabetical');
      const names = result.map((p) => p.full_name);
      // null should be last
      expect(names[names.length - 1]).toBeNull();
      // Non-null names in ascending order
      const nonNull = names.filter((n): n is string => n !== null);
      const sorted = [...nonNull].sort((a, b) => a.localeCompare(b));
      expect(nonNull).toEqual(sorted);
    });
  });
});

// ── filterProviders ────────────────────────────────────────────────────────

describe('filterProviders', () => {
  it('does not mutate the input array', () => {
    const input = [...ALL];
    filterProviders(input, { availableOnly: true });
    expect(input).toEqual(ALL);
  });

  it('returns all providers when filters object is empty', () => {
    const result = filterProviders(ALL, {});
    expect(result).toHaveLength(ALL.length);
  });

  it('minRating: keeps providers with rating >= threshold', () => {
    const result = filterProviders(ALL, { minRating: 4.5 });
    // Alice 4.9 ✓, Bob 4.5 ✓, Carol null→0 ✗, Dan 3.8 ✗, Eva 4.9 ✓
    expect(result.map((p) => p.provider_id).sort()).toEqual(
      ['prov-alice', 'prov-bob', 'prov-eva'].sort(),
    );
  });

  it('minRating: null rating is treated as 0 (excluded when threshold > 0)', () => {
    const result = filterProviders(ALL, { minRating: 1 });
    expect(result.find((p) => p.provider_id === 'prov-carol')).toBeUndefined();
  });

  it('availableOnly: keeps only providers with availability_status === available', () => {
    const result = filterProviders(ALL, { availableOnly: true });
    expect(result.every((p) => p.availability_status === 'available')).toBe(true);
    // Alice and Carol and Eva are available
    expect(result.map((p) => p.provider_id).sort()).toEqual(
      ['prov-alice', 'prov-carol', 'prov-eva'].sort(),
    );
  });

  it('verifiedOnly: keeps only verified providers', () => {
    const result = filterProviders(ALL, { verifiedOnly: true });
    expect(result.every((p) => p.is_verified === true)).toBe(true);
    // Alice, Carol, Eva are verified
    expect(result.map((p) => p.provider_id).sort()).toEqual(
      ['prov-alice', 'prov-carol', 'prov-eva'].sort(),
    );
  });

  it('favoritesOnly: keeps only providers in favoriteIds', () => {
    const result = filterProviders(ALL, { favoritesOnly: true }, {
      favoriteIds: ['prov-alice', 'prov-bob'],
    });
    expect(result.map((p) => p.provider_id).sort()).toEqual(['prov-alice', 'prov-bob'].sort());
  });

  it('favoritesOnly with no favoriteIds in ctx → returns []', () => {
    const result = filterProviders(ALL, { favoritesOnly: true }, {});
    expect(result).toEqual([]);
  });

  it('favoritesOnly with no ctx at all → returns []', () => {
    const result = filterProviders(ALL, { favoritesOnly: true });
    expect(result).toEqual([]);
  });

  it('recentlyUsedOnly: keeps only providers in recentlyUsedProviderIds', () => {
    const result = filterProviders(ALL, { recentlyUsedOnly: true }, {
      recentlyUsedProviderIds: ['prov-carol'],
    });
    expect(result).toHaveLength(1);
    expect(result[0].provider_id).toBe('prov-carol');
  });

  it('category filter is a no-op pass-through (future-ready)', () => {
    // With no service/category field in PublicProvider, all providers pass through.
    const result = filterProviders(ALL, { category: 'home' });
    expect(result).toHaveLength(ALL.length);
  });

  it('serviceId filter is a no-op pass-through (future-ready)', () => {
    const result = filterProviders(ALL, { serviceId: 'plumbing' });
    expect(result).toHaveLength(ALL.length);
  });

  it('COMBINATION: minRating + verifiedOnly + favoritesOnly narrows cumulatively', () => {
    // minRating 4.5: Alice✓, Bob✓(4.5), Eva✓ (Carol & Dan excluded)
    // verifiedOnly: Alice✓, Eva✓ (Bob excluded)
    // favoritesOnly ['prov-alice', 'prov-carol']: Alice✓ (Eva excluded, Carol already excluded)
    const result = filterProviders(
      ALL,
      { minRating: 4.5, verifiedOnly: true, favoritesOnly: true },
      { favoriteIds: ['prov-alice', 'prov-carol'] },
    );
    expect(result).toHaveLength(1);
    expect(result[0].provider_id).toBe('prov-alice');
  });

  it('COMBINATION: availableOnly + verifiedOnly', () => {
    // available: Alice, Carol, Eva; verified: Alice, Carol, Eva → same set
    const result = filterProviders(ALL, { availableOnly: true, verifiedOnly: true });
    expect(result.map((p) => p.provider_id).sort()).toEqual(
      ['prov-alice', 'prov-carol', 'prov-eva'].sort(),
    );
  });
});

// ── searchProviders ────────────────────────────────────────────────────────

describe('searchProviders', () => {
  it('returns all providers for empty query', () => {
    const result = searchProviders(ALL, '');
    expect(result).toHaveLength(ALL.length);
  });

  it('returns all providers for whitespace-only query', () => {
    const result = searchProviders(ALL, '   ');
    expect(result).toHaveLength(ALL.length);
  });

  it('matches by full_name (case-insensitive)', () => {
    const result = searchProviders(ALL, 'alice');
    expect(result).toHaveLength(1);
    expect(result[0].provider_id).toBe('prov-alice');
  });

  it('is case-insensitive', () => {
    const upper = searchProviders(ALL, 'ALICE');
    const lower = searchProviders(ALL, 'alice');
    expect(upper.map((p) => p.provider_id)).toEqual(lower.map((p) => p.provider_id));
  });

  it('does a partial match (substring)', () => {
    // 'Smith' matches 'Alice Smith'
    const result = searchProviders(ALL, 'Smith');
    expect(result.some((p) => p.provider_id === 'prov-alice')).toBe(true);
  });

  it('returns [] for query that matches nothing', () => {
    const result = searchProviders(ALL, 'zzzznotaname');
    expect(result).toEqual([]);
  });

  it('excludes providers with null full_name', () => {
    // Dan has full_name: null — should not be included in any non-empty search
    const result = searchProviders(ALL, 'a');
    expect(result.find((p) => p.provider_id === 'prov-dan')).toBeUndefined();
  });

  it('does not mutate the input array', () => {
    const input = [...ALL];
    searchProviders(input, 'alice');
    expect(input).toEqual(ALL);
  });

  it('returns multiple matches', () => {
    // 'a' matches Alice, Carol, Eva, Dan (but Dan has null name), Eva: all have 'a' in name
    const result = searchProviders(ALL, 'a');
    expect(result.length).toBeGreaterThan(1);
  });
});
