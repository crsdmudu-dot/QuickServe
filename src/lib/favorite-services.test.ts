// favorite-services.test.ts — Tests for src/lib/favorite-services.ts
// Mirrors the Slice 32 favorites.test.ts idiom.
// Mocks @/lib/supabase to avoid real network calls.

import {
  getMyFavoriteServices,
  getFavoriteServiceIds,
  addFavoriteService,
  removeFavoriteService,
  isFavoriteService,
} from '@/lib/favorite-services';
import { SERVICES } from '@/constants/services';

// ── Mock Supabase ──────────────────────────────────────────────────────────

// mockSelectDirect: for getFavoriteServiceIds — select('service_id') awaited directly
// mockSelectOrder:  for getMyFavoriteServices  — select(...).order(...) awaited
const mockGetUser      = jest.fn();
const mockSelectDirect = jest.fn();
const mockSelectOrder  = jest.fn();
const mockInsert       = jest.fn();
const mockDeleteEq1    = jest.fn();
const mockDeleteEq2    = jest.fn();

jest.mock('@/lib/supabase', () => ({
  supabase: {
    auth: { getUser: (...a: unknown[]) => mockGetUser(...a) },
    from: (_table: string) => ({
      // select returns an object that is BOTH:
      //   - directly awaitable (then/catch — for getFavoriteServiceIds)
      //   - chainable via .order() (for getMyFavoriteServices)
      // We achieve this by making mockSelectDirect hold a thenable that also
      // exposes an .order() method pointing to mockSelectOrder.
      select: (...a: unknown[]) => {
        const directResult = mockSelectDirect(...a);
        // Wrap in an object that is both a Promise (via delegation) and has .order()
        return Object.assign(Promise.resolve(directResult), {
          order: (...b: unknown[]) => mockSelectOrder(...b),
        });
      },
      insert:  (...a: unknown[]) => mockInsert(...a),
      delete:  () => ({
        eq: (...a: unknown[]) => {
          mockDeleteEq1(...a);
          return { eq: (...b: unknown[]) => mockDeleteEq2(...b) };
        },
      }),
    }),
  },
}));

beforeEach(() => {
  jest.clearAllMocks();
});

// ── Fixtures ──────────────────────────────────────────────────────────────

// A real service from SERVICES
const PLUMBING   = SERVICES.find((s) => s.id === 'plumbing')!;
const ELECTRICAL = SERVICES.find((s) => s.id === 'electrical')!;

// ── getMyFavoriteServices ──────────────────────────────────────────────────

describe('getMyFavoriteServices', () => {
  it('resolves service_ids to Service objects in order', async () => {
    mockSelectOrder.mockResolvedValue({
      data: [{ service_id: 'plumbing' }, { service_id: 'electrical' }],
      error: null,
    });

    const result = await getMyFavoriteServices();

    expect(result).toEqual([PLUMBING, ELECTRICAL]);
  });

  it('drops unknown service_ids silently', async () => {
    mockSelectOrder.mockResolvedValue({
      data: [{ service_id: 'plumbing' }, { service_id: 'unknown-service-xyz' }],
      error: null,
    });

    const result = await getMyFavoriteServices();

    expect(result).toEqual([PLUMBING]);
  });

  it('returns [] on DB error', async () => {
    mockSelectOrder.mockResolvedValue({ data: null, error: { message: 'DB error' } });

    const result = await getMyFavoriteServices();
    expect(result).toEqual([]);
  });

  it('returns [] when data is null without error', async () => {
    mockSelectOrder.mockResolvedValue({ data: null, error: null });

    const result = await getMyFavoriteServices();
    expect(result).toEqual([]);
  });

  it('returns [] when favorites list is empty', async () => {
    mockSelectOrder.mockResolvedValue({ data: [], error: null });

    const result = await getMyFavoriteServices();
    expect(result).toEqual([]);
  });
});

// ── getFavoriteServiceIds ──────────────────────────────────────────────────

describe('getFavoriteServiceIds', () => {
  it('returns service_id strings from the table', async () => {
    mockSelectDirect.mockResolvedValue({
      data: [{ service_id: 'plumbing' }, { service_id: 'massage' }],
      error: null,
    });

    const result = await getFavoriteServiceIds();

    expect(mockSelectDirect).toHaveBeenCalledWith('service_id');
    expect(result).toEqual(['plumbing', 'massage']);
  });

  it('returns [] on error', async () => {
    mockSelectDirect.mockResolvedValue({ data: null, error: { message: 'DB error' } });
    expect(await getFavoriteServiceIds()).toEqual([]);
  });

  it('returns [] when data is null', async () => {
    mockSelectDirect.mockResolvedValue({ data: null, error: null });
    expect(await getFavoriteServiceIds()).toEqual([]);
  });

  it('returns [] for empty list', async () => {
    mockSelectDirect.mockResolvedValue({ data: [], error: null });
    expect(await getFavoriteServiceIds()).toEqual([]);
  });
});

// ── addFavoriteService ─────────────────────────────────────────────────────

describe('addFavoriteService', () => {
  it('inserts with customer_id from auth and returns ok', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u-123' } } });
    mockInsert.mockResolvedValue({ error: null });

    const result = await addFavoriteService('plumbing');

    expect(result).toEqual({ ok: true });
    expect(mockInsert).toHaveBeenCalledWith({
      customer_id: 'u-123',
      service_id:  'plumbing',
    });
    // customer_id is never undefined
    expect(mockInsert).not.toHaveBeenCalledWith(
      expect.objectContaining({ customer_id: undefined }),
    );
  });

  it('treats duplicate (code 23505) as success { ok: true }', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u-123' } } });
    mockInsert.mockResolvedValue({
      error: { code: '23505', message: 'duplicate key value violates unique constraint' },
    });

    const result = await addFavoriteService('plumbing');
    expect(result).toEqual({ ok: true });
  });

  it('treats duplicate via message text as success', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u-123' } } });
    mockInsert.mockResolvedValue({
      error: { code: 'PGRST204', message: 'error 23505 unique constraint' },
    });

    const result = await addFavoriteService('plumbing');
    expect(result).toEqual({ ok: true });
  });

  it('returns { ok: false } on other DB error', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u-123' } } });
    mockInsert.mockResolvedValue({ error: { code: '42501', message: 'permission denied' } });

    const result = await addFavoriteService('plumbing');
    expect(result).toEqual({ ok: false, error: 'Could not add favorite.' });
  });

  it('returns { ok: false } when not signed in', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });

    const result = await addFavoriteService('plumbing');
    expect(result).toEqual({ ok: false, error: 'You must be signed in.' });
    expect(mockInsert).not.toHaveBeenCalled();
  });
});

// ── removeFavoriteService ──────────────────────────────────────────────────

describe('removeFavoriteService', () => {
  it('deletes by customer_id (from auth) + service_id and returns ok', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u-123' } } });
    mockDeleteEq2.mockResolvedValue({ error: null });

    const result = await removeFavoriteService('plumbing');

    expect(result).toEqual({ ok: true });
    expect(mockDeleteEq1).toHaveBeenCalledWith('customer_id', 'u-123');
    expect(mockDeleteEq2).toHaveBeenCalledWith('service_id', 'plumbing');
  });

  it('returns { ok: true } when removing a non-existent favorite (no DB error)', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u-123' } } });
    // DELETE with no matching rows is not an error in Postgres
    mockDeleteEq2.mockResolvedValue({ error: null });

    const result = await removeFavoriteService('non-existent-service');
    expect(result).toEqual({ ok: true });
  });

  it('returns { ok: false } on real DB error', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u-123' } } });
    mockDeleteEq2.mockResolvedValue({ error: { message: 'connection error' } });

    const result = await removeFavoriteService('plumbing');
    expect(result).toEqual({ ok: false, error: 'Could not remove favorite.' });
  });

  it('returns { ok: false } when not signed in', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });

    const result = await removeFavoriteService('plumbing');
    expect(result).toEqual({ ok: false, error: 'You must be signed in.' });
  });
});

// ── isFavoriteService ──────────────────────────────────────────────────────

describe('isFavoriteService', () => {
  it('pure form: returns true when serviceId is in supplied favoriteIds (no I/O)', () => {
    const result = isFavoriteService('plumbing', ['plumbing', 'massage']);
    expect(result).toBe(true);
    // Pure — no supabase calls
    expect(mockSelectDirect).not.toHaveBeenCalled();
    expect(mockGetUser).not.toHaveBeenCalled();
  });

  it('pure form: returns false when serviceId is NOT in supplied favoriteIds', () => {
    const result = isFavoriteService('electrical', ['plumbing', 'massage']);
    expect(result).toBe(false);
    expect(mockSelectDirect).not.toHaveBeenCalled();
  });

  it('pure form: returns false for empty favoriteIds array', () => {
    expect(isFavoriteService('plumbing', [])).toBe(false);
  });

  it('async form: fetches from DB when favoriteIds not supplied', async () => {
    mockSelectDirect.mockResolvedValue({
      data: [{ service_id: 'plumbing' }],
      error: null,
    });

    const result = await isFavoriteService('plumbing');
    expect(result).toBe(true);
    expect(mockSelectDirect).toHaveBeenCalledWith('service_id');
  });

  it('async form: returns false when not in DB favorites', async () => {
    mockSelectDirect.mockResolvedValue({
      data: [{ service_id: 'massage' }],
      error: null,
    });

    const result = await isFavoriteService('plumbing');
    expect(result).toBe(false);
  });
});
