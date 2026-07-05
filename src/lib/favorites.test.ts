// favorites.test.ts — Tests for src/lib/favorites.ts
// Mocks @/lib/supabase to avoid real network calls.

import {
  getMyFavoriteProviders,
  getFavoriteProviderIds,
  addFavoriteProvider,
  removeFavoriteProvider,
  isFavoriteProvider,
  type PublicProvider,
} from '@/lib/favorites';

// ── Mock Supabase ──────────────────────────────────────────────────────────

const mockGetUser = jest.fn();
const mockRpc = jest.fn();
const mockSelect = jest.fn();
const mockInsert = jest.fn();
const mockDelete = jest.fn();
const mockDeleteEq1 = jest.fn();
const mockDeleteEq2 = jest.fn();

jest.mock('@/lib/supabase', () => ({
  supabase: {
    auth: { getUser: (...a: unknown[]) => mockGetUser(...a) },
    rpc: (...a: unknown[]) => mockRpc(...a),
    from: (_table: string) => ({
      select: (...a: unknown[]) => mockSelect(...a),
      insert: (...a: unknown[]) => mockInsert(...a),
      delete: () => ({
        eq: (...a: unknown[]) => {
          mockDeleteEq1(...a);
          return {
            eq: (...b: unknown[]) => mockDeleteEq2(...b),
          };
        },
      }),
    }),
  },
}));

beforeEach(() => {
  jest.clearAllMocks();
});

// ── Fixtures ──────────────────────────────────────────────────────────────

const PROVIDER_A: PublicProvider = {
  provider_id: 'prov-1',
  full_name: 'Alice Smith',
  average_rating: 4.8,
  review_count: 42,
  completed_jobs_count: 150,
  is_verified: true,
  years_experience: 5,
  availability_status: 'available',
  profile_photo_url: 'https://example.com/alice.jpg',
  created_at: '2025-01-01T00:00:00Z',
};

const PROVIDER_B: PublicProvider = {
  provider_id: 'prov-2',
  full_name: 'Bob Jones',
  average_rating: 4.2,
  review_count: 20,
  completed_jobs_count: 80,
  is_verified: false,
  years_experience: 2,
  availability_status: 'busy',
  profile_photo_url: null,
  created_at: '2025-06-01T00:00:00Z',
};

// ── getMyFavoriteProviders ─────────────────────────────────────────────────

describe('getMyFavoriteProviders', () => {
  it('calls rpc get_my_favorite_providers and returns data', async () => {
    mockRpc.mockResolvedValue({ data: [PROVIDER_A, PROVIDER_B], error: null });

    const result = await getMyFavoriteProviders();

    expect(mockRpc).toHaveBeenCalledWith('get_my_favorite_providers');
    expect(result).toEqual([PROVIDER_A, PROVIDER_B]);
  });

  it('returns [] on rpc error', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'DB error' } });

    const result = await getMyFavoriteProviders();
    expect(result).toEqual([]);
  });

  it('returns [] when data is null without error', async () => {
    mockRpc.mockResolvedValue({ data: null, error: null });

    const result = await getMyFavoriteProviders();
    expect(result).toEqual([]);
  });
});

// ── getFavoriteProviderIds ─────────────────────────────────────────────────

describe('getFavoriteProviderIds', () => {
  it('returns provider_id strings from the favorite_providers table', async () => {
    mockSelect.mockResolvedValue({
      data: [{ provider_id: 'prov-1' }, { provider_id: 'prov-2' }],
      error: null,
    });

    const result = await getFavoriteProviderIds();

    expect(mockSelect).toHaveBeenCalledWith('provider_id');
    expect(result).toEqual(['prov-1', 'prov-2']);
  });

  it('returns [] on error', async () => {
    mockSelect.mockResolvedValue({ data: null, error: { message: 'DB error' } });

    const result = await getFavoriteProviderIds();
    expect(result).toEqual([]);
  });

  it('returns [] when data is null', async () => {
    mockSelect.mockResolvedValue({ data: null, error: null });

    const result = await getFavoriteProviderIds();
    expect(result).toEqual([]);
  });

  it('returns [] for empty favorites list', async () => {
    mockSelect.mockResolvedValue({ data: [], error: null });

    const result = await getFavoriteProviderIds();
    expect(result).toEqual([]);
  });
});

// ── addFavoriteProvider ────────────────────────────────────────────────────

describe('addFavoriteProvider', () => {
  it('inserts with customer_id from auth (not from caller) and returns ok', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-99' } } });
    mockInsert.mockResolvedValue({ error: null });

    const result = await addFavoriteProvider('prov-1');

    expect(result).toEqual({ ok: true });
    expect(mockInsert).toHaveBeenCalledWith({
      customer_id: 'user-99',
      provider_id: 'prov-1',
    });
    // customer_id comes from auth, never from the argument
    expect(mockInsert).not.toHaveBeenCalledWith(
      expect.objectContaining({ customer_id: undefined }),
    );
  });

  it('treats duplicate favorite (code 23505) as success { ok: true }', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-99' } } });
    mockInsert.mockResolvedValue({
      error: { code: '23505', message: 'duplicate key value violates unique constraint' },
    });

    const result = await addFavoriteProvider('prov-1');
    expect(result).toEqual({ ok: true });
  });

  it('treats duplicate via error message (23505 in message) as success', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-99' } } });
    mockInsert.mockResolvedValue({
      error: { code: 'PGRST204', message: 'error 23505 unique constraint violated' },
    });

    const result = await addFavoriteProvider('prov-1');
    expect(result).toEqual({ ok: true });
  });

  it('returns { ok: false } on other DB error', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-99' } } });
    mockInsert.mockResolvedValue({ error: { code: '42501', message: 'permission denied' } });

    const result = await addFavoriteProvider('prov-1');
    expect(result).toEqual({ ok: false, error: 'Could not add favorite.' });
  });

  it('returns { ok: false } when not signed in', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });

    const result = await addFavoriteProvider('prov-1');
    expect(result).toEqual({ ok: false, error: 'You must be signed in.' });
    expect(mockInsert).not.toHaveBeenCalled();
  });
});

// ── removeFavoriteProvider ────────────────────────────────────────────────

describe('removeFavoriteProvider', () => {
  it('deletes by customer_id (from auth) + provider_id and returns ok', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-99' } } });
    mockDeleteEq2.mockResolvedValue({ error: null });

    const result = await removeFavoriteProvider('prov-1');

    expect(result).toEqual({ ok: true });
    expect(mockDeleteEq1).toHaveBeenCalledWith('customer_id', 'user-99');
    expect(mockDeleteEq2).toHaveBeenCalledWith('provider_id', 'prov-1');
  });

  it('returns { ok: true } when removing a non-existent favorite (no error from DB)', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-99' } } });
    // DELETE with no matching rows is not an error in Postgres — no error returned
    mockDeleteEq2.mockResolvedValue({ error: null });

    const result = await removeFavoriteProvider('prov-nonexistent');
    expect(result).toEqual({ ok: true });
  });

  it('returns { ok: false } on real DB error', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-99' } } });
    mockDeleteEq2.mockResolvedValue({ error: { message: 'connection error' } });

    const result = await removeFavoriteProvider('prov-1');
    expect(result).toEqual({ ok: false, error: 'Could not remove favorite.' });
  });

  it('returns { ok: false } when not signed in', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });

    const result = await removeFavoriteProvider('prov-1');
    expect(result).toEqual({ ok: false, error: 'You must be signed in.' });
  });
});

// ── isFavoriteProvider ────────────────────────────────────────────────────

describe('isFavoriteProvider', () => {
  it('returns true when providerId is in the supplied favoriteIds (pure, no I/O)', async () => {
    const result = await isFavoriteProvider('prov-1', ['prov-1', 'prov-2']);
    expect(result).toBe(true);
    // No supabase calls should have been made
    expect(mockRpc).not.toHaveBeenCalled();
    expect(mockSelect).not.toHaveBeenCalled();
  });

  it('returns false when providerId is NOT in the supplied favoriteIds (pure)', async () => {
    const result = await isFavoriteProvider('prov-3', ['prov-1', 'prov-2']);
    expect(result).toBe(false);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('returns false for empty favoriteIds array (pure)', async () => {
    const result = await isFavoriteProvider('prov-1', []);
    expect(result).toBe(false);
  });

  it('fetches from DB when favoriteIds not supplied', async () => {
    mockSelect.mockResolvedValue({
      data: [{ provider_id: 'prov-1' }],
      error: null,
    });

    const result = await isFavoriteProvider('prov-1');
    expect(result).toBe(true);
    expect(mockSelect).toHaveBeenCalledWith('provider_id');
  });

  it('returns false when not in DB favorites (no favoriteIds supplied)', async () => {
    mockSelect.mockResolvedValue({
      data: [{ provider_id: 'prov-2' }],
      error: null,
    });

    const result = await isFavoriteProvider('prov-1');
    expect(result).toBe(false);
  });
});
