import {
  fetchActiveServiceCategories,
  fetchActiveServices,
  listActiveServiceCategories,
  listActiveServices,
  getServiceBySlugFromDb,
  toService,
  parsePrice,
  dbCategoryToLegacy,
  DbService,
  DbCategory,
} from '@/lib/services-catalog';

// ── Mock fns (prefixed with "mock" — Jest factory rule) ───────────────────

const mockRpc = jest.fn();
const mockSelect = jest.fn();
const mockEq = jest.fn();
const mockOrder = jest.fn();
const mockMaybeSingle = jest.fn();

// Builder helpers — the Supabase query builder is a fluent chain.
// We need to support: .select('*').eq(...).order(...) and
//                     .select('*').order(...).order(...)
// and                 .select('*').eq(...).maybeSingle()

function makeOrderChain(returnValue: unknown) {
  // Supports chained .order().order()
  const orderFn = jest.fn(() => makeOrderChain(returnValue));
  (orderFn as jest.Mock).mockImplementation((...args: unknown[]) => {
    mockOrder(...args);
    return makeOrderChain(returnValue);
  });
  // A terminal chain needs to be awaitable
  const obj = {
    order: (...args: unknown[]) => {
      mockOrder(...args);
      return obj; // returns self so multiple .order() chains work
    },
    then: (resolve: (v: unknown) => void) => Promise.resolve(returnValue).then(resolve),
    catch: (reject: (e: unknown) => void) => Promise.resolve(returnValue).catch(reject),
  };
  return obj;
}

jest.mock('@/lib/supabase', () => ({
  supabase: {
    rpc: (...a: unknown[]) => mockRpc(...a),
    from: (_table: string) => ({
      select: (...a: unknown[]) => {
        mockSelect(...a);
        return {
          eq: (...b: unknown[]) => {
            mockEq(...b);
            return {
              order: (...c: unknown[]) => {
                mockOrder(...c);
                // Return a thenable that resolves to mockEq's latest result
                return {
                  then: (res: (v: unknown) => void) =>
                    Promise.resolve(mockEq.mock.results.slice(-1)[0]?.value).then(res),
                  catch: (rej: (e: unknown) => void) =>
                    Promise.resolve(mockEq.mock.results.slice(-1)[0]?.value).catch(rej),
                };
              },
              maybeSingle: (...c: unknown[]) => mockMaybeSingle(...c),
            };
          },
          order: (...c: unknown[]) => {
            mockOrder(...c);
            // Returns an object that supports chaining more .order() calls and is awaitable
            const chain: {
              order: (...args: unknown[]) => typeof chain;
              then: (res: (v: unknown) => void) => Promise<unknown>;
              catch: (rej: (e: unknown) => void) => Promise<unknown>;
            } = {
              order: (...d: unknown[]) => {
                mockOrder(...d);
                return chain;
              },
              then: (res) => Promise.resolve(mockOrder.mock.results.slice(-1)[0]?.value).then(res),
              catch: (rej) => Promise.resolve(mockOrder.mock.results.slice(-1)[0]?.value).catch(rej),
            };
            return chain;
          },
        };
      },
    }),
  },
}));

beforeEach(() => {
  jest.clearAllMocks();
});

// ── Helpers ────────────────────────────────────────────────────────────────

function makeDbService(overrides: Partial<DbService> = {}): DbService {
  return {
    id: 'uuid-1',
    slug: 'house-cleaning',
    name: 'House Cleaning',
    short_description: 'Deep & regular cleaning',
    full_description: null,
    category_id: 'cat-uuid-1',
    icon: '🧹',
    color: null,
    display_order: 1,
    status: 'active',
    featured: false,
    trending: false,
    emergency_available: false,
    inspection_required: false,
    available_24_7: false,
    estimated_duration: null,
    starting_price_text: '1500',
    active_from: null,
    active_until: null,
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
    ...overrides,
  };
}

function makeDbCategory(overrides: Partial<DbCategory> = {}): DbCategory {
  return {
    id: 'cat-uuid-1',
    slug: 'home',
    name: 'Home Services',
    icon: '🏠',
    color: '#FF0000',
    display_order: 1,
    active: true,
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
    ...overrides,
  };
}

// ── listActiveServiceCategories ────────────────────────────────────────────

describe('listActiveServiceCategories', () => {
  it('queries service_categories with active=true ordered by display_order ascending', async () => {
    const rows = [makeDbCategory()];
    mockEq.mockReturnValue({ data: rows, error: null });

    const result = await listActiveServiceCategories();

    expect(result).toEqual(rows);
    expect(mockSelect).toHaveBeenCalledWith('*');
    expect(mockEq).toHaveBeenCalledWith('active', true);
    expect(mockOrder).toHaveBeenCalledWith('display_order', { ascending: true });
  });

  it('returns [] on error', async () => {
    mockEq.mockReturnValue({ data: null, error: { message: 'DB error' } });

    const result = await listActiveServiceCategories();

    expect(result).toEqual([]);
  });

  it('returns [] when data is null (no error)', async () => {
    mockEq.mockReturnValue({ data: null, error: null });

    const result = await listActiveServiceCategories();

    expect(result).toEqual([]);
  });
});

// ── listActiveServices ─────────────────────────────────────────────────────

describe('listActiveServices', () => {
  it('queries services with status=active ordered by display_order ascending', async () => {
    const rows = [makeDbService()];
    mockEq.mockReturnValue({ data: rows, error: null });

    const result = await listActiveServices();

    expect(result).toEqual(rows);
    expect(mockSelect).toHaveBeenCalledWith('*');
    expect(mockEq).toHaveBeenCalledWith('status', 'active');
    expect(mockOrder).toHaveBeenCalledWith('display_order', { ascending: true });
  });

  it('returns [] on error', async () => {
    mockEq.mockReturnValue({ data: null, error: { message: 'fail' } });

    const result = await listActiveServices();

    expect(result).toEqual([]);
  });
});

// ── fetchActiveServices / fetchActiveServiceCategories (error-aware) ─────────
// These surface the SUCCESS_EMPTY vs FETCH_ERROR distinction the list* helpers
// cannot express (both return []). Used by ServicesProvider to decide fallback.

describe('fetchActiveServices (error-aware)', () => {
  it('returns { ok: true, data: [] } on a successful EMPTY result (not an error)', async () => {
    mockEq.mockReturnValue({ data: [], error: null });

    const result = await fetchActiveServices();

    expect(result).toEqual({ ok: true, data: [] });
  });

  it('returns { ok: true, data } with rows on success', async () => {
    const rows = [makeDbService()];
    mockEq.mockReturnValue({ data: rows, error: null });

    const result = await fetchActiveServices();

    expect(result).toEqual({ ok: true, data: rows });
  });

  it('returns { ok: false } on a genuine query error (distinct from empty success)', async () => {
    mockEq.mockReturnValue({ data: null, error: { message: 'boom' } });

    const result = await fetchActiveServices();

    expect(result.ok).toBe(false);
    expect(result.data).toEqual([]);
  });
});

describe('fetchActiveServiceCategories (error-aware)', () => {
  it('returns { ok: true, data: [] } on a successful EMPTY result', async () => {
    mockEq.mockReturnValue({ data: [], error: null });

    expect(await fetchActiveServiceCategories()).toEqual({ ok: true, data: [] });
  });

  it('returns { ok: false } on a genuine query error', async () => {
    mockEq.mockReturnValue({ data: null, error: { message: 'boom' } });

    const result = await fetchActiveServiceCategories();

    expect(result.ok).toBe(false);
  });
});

// ── listAdminServiceCategories ─────────────────────────────────────────────

// ── listAdminServices ──────────────────────────────────────────────────────

// ── getServiceBySlugFromDb ─────────────────────────────────────────────────

describe('getServiceBySlugFromDb', () => {
  it('queries by slug and calls maybeSingle, returns the row on success', async () => {
    const row = makeDbService();
    mockMaybeSingle.mockResolvedValue({ data: row, error: null });

    const result = await getServiceBySlugFromDb('house-cleaning');

    expect(result).toEqual(row);
    expect(mockSelect).toHaveBeenCalledWith('*');
    expect(mockEq).toHaveBeenCalledWith('slug', 'house-cleaning');
    expect(mockMaybeSingle).toHaveBeenCalled();
  });

  it('returns null when row is not found (data: null, no error)', async () => {
    mockMaybeSingle.mockResolvedValue({ data: null, error: null });

    const result = await getServiceBySlugFromDb('nonexistent');

    expect(result).toBeNull();
  });

  it('returns null on error', async () => {
    mockMaybeSingle.mockResolvedValue({ data: null, error: { message: 'DB error' } });

    const result = await getServiceBySlugFromDb('house-cleaning');

    expect(result).toBeNull();
  });
});

// ── adminCreateCategory ────────────────────────────────────────────────────

// ── adminUpdateCategory ────────────────────────────────────────────────────

// ── adminSetCategoryActive ─────────────────────────────────────────────────

// ── adminReorderCategories ─────────────────────────────────────────────────

// ── adminCreateService ─────────────────────────────────────────────────────

// ── adminUpdateService ─────────────────────────────────────────────────────

// ── adminSetServiceStatus ──────────────────────────────────────────────────

// ── adminDuplicateService ──────────────────────────────────────────────────

// ── adminReorderServices ───────────────────────────────────────────────────

// ── parsePrice ─────────────────────────────────────────────────────────────

describe('parsePrice', () => {
  it('parses a plain integer string: "1500" → 1500', () => {
    expect(parsePrice('1500')).toBe(1500);
  });

  it('parses "KES 1,500" → 1500', () => {
    expect(parsePrice('KES 1,500')).toBe(1500);
  });

  it('parses "from 500/hr" → 500 (leading digits)', () => {
    expect(parsePrice('from 500/hr')).toBe(500);
  });

  it('returns undefined for null', () => {
    expect(parsePrice(null)).toBeUndefined();
  });

  it('returns undefined for empty string', () => {
    expect(parsePrice('')).toBeUndefined();
  });

  it('returns undefined for non-numeric text', () => {
    expect(parsePrice('N/A')).toBeUndefined();
  });

  it('parses decimal price: "1500.50" → 1500.50', () => {
    expect(parsePrice('1500.50')).toBe(1500.5);
  });
});

// ── toService ──────────────────────────────────────────────────────────────

describe('toService', () => {
  it('maps slug → id, name → title', () => {
    const db = makeDbService({ slug: 'house-cleaning', name: 'House Cleaning' });
    const svc = toService(db);
    expect(svc.id).toBe('house-cleaning');
    expect(svc.title).toBe('House Cleaning');
  });

  it('maps short_description → subtitle, undefined when null', () => {
    const db1 = makeDbService({ short_description: 'Deep & regular cleaning' });
    expect(toService(db1).subtitle).toBe('Deep & regular cleaning');

    const db2 = makeDbService({ short_description: null });
    expect(toService(db2).subtitle).toBeUndefined();
  });

  it('uses db.icon when present, falls back to 🧩 when null', () => {
    const db1 = makeDbService({ icon: '🧹' });
    expect(toService(db1).icon).toBe('🧹');

    const db2 = makeDbService({ icon: null });
    expect(toService(db2).icon).toBe('🧩');
  });

  it('sets badge to "Popular" when featured=true', () => {
    const db = makeDbService({ featured: true, trending: false });
    expect(toService(db).badge).toBe('Popular');
  });

  it('sets badge to "New" when trending=true and featured=false', () => {
    const db = makeDbService({ featured: false, trending: true });
    expect(toService(db).badge).toBe('New');
  });

  it('featured takes precedence over trending for badge', () => {
    const db = makeDbService({ featured: true, trending: true });
    expect(toService(db).badge).toBe('Popular');
  });

  it('sets badge to undefined when neither featured nor trending', () => {
    const db = makeDbService({ featured: false, trending: false });
    expect(toService(db).badge).toBeUndefined();
  });

  it('passes startingPrice from parsePrice(starting_price_text)', () => {
    const db1 = makeDbService({ starting_price_text: '1500' });
    expect(toService(db1).startingPrice).toBe(1500);

    const db2 = makeDbService({ starting_price_text: 'KES 1,500' });
    expect(toService(db2).startingPrice).toBe(1500);

    const db3 = makeDbService({ starting_price_text: null });
    expect(toService(db3).startingPrice).toBeUndefined();
  });

  it('uses categorySlug as category when provided', () => {
    const db = makeDbService();
    expect(toService(db, 'auto').category).toBe('auto');
  });

  it('defaults category to "home" when categorySlug is absent', () => {
    const db = makeDbService();
    expect(toService(db).category).toBe('home');
  });
});

// ── dbCategoryToLegacy ─────────────────────────────────────────────────────

describe('dbCategoryToLegacy', () => {
  it('maps slug → id, name → name, icon → icon', () => {
    const db = makeDbCategory({ slug: 'home', name: 'Home Services', icon: '🏠' });
    const result = dbCategoryToLegacy(db);
    expect(result).toEqual({ id: 'home', name: 'Home Services', icon: '🏠' });
  });

  it('falls back to 🗂️ when icon is null', () => {
    const db = makeDbCategory({ icon: null });
    const result = dbCategoryToLegacy(db);
    expect(result.icon).toBe('🗂️');
  });
});
