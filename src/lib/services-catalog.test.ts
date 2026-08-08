import {
  fetchActiveServiceCategories,
  fetchActiveServices,
  listActiveServiceCategories,
  listActiveServices,
  listAdminServiceCategories,
  listAdminServices,
  getServiceBySlugFromDb,
  adminCreateCategory,
  adminUpdateCategory,
  adminSetCategoryActive,
  adminReorderCategories,
  adminCreateService,
  adminUpdateService,
  adminSetServiceStatus,
  adminDuplicateService,
  adminReorderServices,
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

describe('listAdminServiceCategories', () => {
  it('queries service_categories without active filter, ordered by display_order', async () => {
    const rows = [makeDbCategory(), makeDbCategory({ active: false, id: 'cat-2' })];
    mockOrder.mockReturnValue({ data: rows, error: null });

    const result = await listAdminServiceCategories();

    expect(result).toEqual(rows);
    expect(mockSelect).toHaveBeenCalledWith('*');
    expect(mockEq).not.toHaveBeenCalled();
    expect(mockOrder).toHaveBeenCalledWith('display_order');
  });

  it('returns [] on error', async () => {
    mockOrder.mockReturnValue({ data: null, error: { message: 'DB error' } });

    const result = await listAdminServiceCategories();

    expect(result).toEqual([]);
  });
});

// ── listAdminServices ──────────────────────────────────────────────────────

describe('listAdminServices', () => {
  it('queries services without status filter, ordered by category_id then display_order', async () => {
    const rows = [makeDbService(), makeDbService({ status: 'draft', id: 'uuid-2', slug: 'draft-svc' })];
    // Both .order() calls flow through mockOrder
    mockOrder.mockReturnValue({ data: rows, error: null });

    const result = await listAdminServices();

    expect(result).toEqual(rows);
    expect(mockSelect).toHaveBeenCalledWith('*');
    expect(mockEq).not.toHaveBeenCalled();
    expect(mockOrder).toHaveBeenCalledWith('category_id');
    expect(mockOrder).toHaveBeenCalledWith('display_order');
  });

  it('returns [] on error', async () => {
    mockOrder.mockReturnValue({ data: null, error: { message: 'fail' } });

    const result = await listAdminServices();

    expect(result).toEqual([]);
  });
});

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

describe('adminCreateCategory', () => {
  it('calls admin_create_category rpc with exact p_ params and returns {ok, id}', async () => {
    mockRpc.mockResolvedValue({ data: 'new-cat-uuid', error: null });

    const result = await adminCreateCategory({ slug: 'home', name: 'Home Services', icon: '🏠', color: '#FF0' });

    expect(result).toEqual({ ok: true, id: 'new-cat-uuid' });
    expect(mockRpc).toHaveBeenCalledWith('admin_create_category', {
      p_slug: 'home',
      p_name: 'Home Services',
      p_icon: '🏠',
      p_color: '#FF0',
    });
  });

  it('defaults icon and color to null when omitted', async () => {
    mockRpc.mockResolvedValue({ data: 'new-cat-uuid', error: null });

    await adminCreateCategory({ slug: 'auto', name: 'Auto Services' });

    expect(mockRpc).toHaveBeenCalledWith('admin_create_category', {
      p_slug: 'auto',
      p_name: 'Auto Services',
      p_icon: null,
      p_color: null,
    });
  });

  it('returns friendly error for duplicate slug (23505 with slug in message)', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { code: '23505', message: 'duplicate key value violates unique constraint "service_categories_slug_key"' } });

    const result = await adminCreateCategory({ slug: 'home', name: 'Home 2' });

    expect(result).toEqual({ ok: false, error: 'A service/category with that slug already exists.' });
  });

  it('returns friendly error for invalid slug format', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { code: 'P0001', message: 'invalid slug format' } });

    const result = await adminCreateCategory({ slug: 'INVALID SLUG', name: 'Bad' });

    expect(result).toEqual({ ok: false, error: 'Slug must be lowercase letters, numbers and hyphens.' });
  });

  it('returns generic error for unknown failures', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { code: 'XXXXX', message: 'some unknown db error' } });

    const result = await adminCreateCategory({ slug: 'test', name: 'Test' });

    expect(result).toEqual({ ok: false, error: 'Could not save. Please try again.' });
  });
});

// ── adminUpdateCategory ────────────────────────────────────────────────────

describe('adminUpdateCategory', () => {
  it('calls admin_update_category rpc with exact p_ params and returns {ok:true}', async () => {
    mockRpc.mockResolvedValue({ data: null, error: null });

    const result = await adminUpdateCategory({ id: 'cat-1', name: 'Updated Name', icon: '🏡', color: '#ABC' });

    expect(result).toEqual({ ok: true });
    expect(mockRpc).toHaveBeenCalledWith('admin_update_category', {
      p_id: 'cat-1',
      p_name: 'Updated Name',
      p_icon: '🏡',
      p_color: '#ABC',
    });
  });

  it('returns {ok:false, error} on failure', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { code: 'XXXXX', message: 'fail' } });

    const result = await adminUpdateCategory({ id: 'cat-1', name: 'X' });

    expect(result).toEqual({ ok: false, error: 'Could not save. Please try again.' });
  });
});

// ── adminSetCategoryActive ─────────────────────────────────────────────────

describe('adminSetCategoryActive', () => {
  it('calls admin_set_category_active with p_id and p_active', async () => {
    mockRpc.mockResolvedValue({ data: null, error: null });

    const result = await adminSetCategoryActive('cat-1', false);

    expect(result).toEqual({ ok: true });
    expect(mockRpc).toHaveBeenCalledWith('admin_set_category_active', {
      p_id: 'cat-1',
      p_active: false,
    });
  });

  it('returns friendly error when category has active services', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { code: 'P0001', message: 'category has active services' } });

    const result = await adminSetCategoryActive('cat-1', false);

    expect(result).toEqual({ ok: false, error: 'Cannot deactivate a category that still has active services.' });
  });
});

// ── adminReorderCategories ─────────────────────────────────────────────────

describe('adminReorderCategories', () => {
  it('calls admin_reorder_categories with p_ordered_ids array', async () => {
    mockRpc.mockResolvedValue({ data: null, error: null });

    const ids = ['id-1', 'id-2', 'id-3'];
    const result = await adminReorderCategories(ids);

    expect(result).toEqual({ ok: true });
    expect(mockRpc).toHaveBeenCalledWith('admin_reorder_categories', {
      p_ordered_ids: ids,
    });
  });

  it('returns {ok:false, error} on failure', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { code: 'XXXXX', message: 'fail' } });

    const result = await adminReorderCategories(['id-1']);

    expect(result).toEqual({ ok: false, error: 'Could not save. Please try again.' });
  });
});

// ── adminCreateService ─────────────────────────────────────────────────────

describe('adminCreateService', () => {
  it('calls admin_create_service with all 9 p_ params and returns {ok, id}', async () => {
    mockRpc.mockResolvedValue({ data: 'new-svc-uuid', error: null });

    const result = await adminCreateService({
      slug: 'house-cleaning',
      name: 'House Cleaning',
      shortDescription: 'Deep clean',
      fullDescription: 'Full description here',
      categoryId: 'cat-uuid-1',
      icon: '🧹',
      color: '#FFF',
      estimatedDuration: '2 hours',
      startingPriceText: '1500',
    });

    expect(result).toEqual({ ok: true, id: 'new-svc-uuid' });
    expect(mockRpc).toHaveBeenCalledWith('admin_create_service', {
      p_slug: 'house-cleaning',
      p_name: 'House Cleaning',
      p_short_description: 'Deep clean',
      p_full_description: 'Full description here',
      p_category_id: 'cat-uuid-1',
      p_icon: '🧹',
      p_color: '#FFF',
      p_estimated_duration: '2 hours',
      p_starting_price_text: '1500',
    });
  });

  it('uses null for optional params when omitted', async () => {
    mockRpc.mockResolvedValue({ data: 'new-svc-uuid', error: null });

    await adminCreateService({ slug: 'plumbing', name: 'Plumbing', categoryId: 'cat-1' });

    expect(mockRpc).toHaveBeenCalledWith('admin_create_service', {
      p_slug: 'plumbing',
      p_name: 'Plumbing',
      p_short_description: null,
      p_full_description: null,
      p_category_id: 'cat-1',
      p_icon: null,
      p_color: null,
      p_estimated_duration: null,
      p_starting_price_text: null,
    });
  });

  it('returns friendly error for duplicate slug (23505 on slug constraint)', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { code: '23505', message: 'duplicate key value violates unique constraint "services_slug_key"' } });

    const result = await adminCreateService({ slug: 'house-cleaning', name: 'Dup', categoryId: 'cat-1' });

    expect(result).toEqual({ ok: false, error: 'A service/category with that slug already exists.' });
  });

  it('returns friendly error for duplicate name-in-category (23505 on name+category constraint)', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { code: '23505', message: 'duplicate key value violates unique constraint "services_category_id_name_key"' } });

    const result = await adminCreateService({ slug: 'new-slug', name: 'House Cleaning', categoryId: 'cat-1' });

    expect(result).toEqual({ ok: false, error: 'A service with that name already exists in this category.' });
  });
});

// ── adminUpdateService ─────────────────────────────────────────────────────

describe('adminUpdateService', () => {
  it('calls admin_update_service with all 14 p_ params — NO slug', async () => {
    mockRpc.mockResolvedValue({ data: null, error: null });

    const result = await adminUpdateService({
      id: 'svc-1',
      name: 'House Cleaning Pro',
      shortDescription: 'Professional clean',
      fullDescription: 'Full desc',
      categoryId: 'cat-1',
      icon: '🧹',
      color: '#FFF',
      estimatedDuration: '3 hours',
      startingPriceText: '2000',
      featured: true,
      trending: false,
      emergencyAvailable: false,
      inspectionRequired: true,
      available247: false,
    });

    expect(result).toEqual({ ok: true });
    const callArgs = mockRpc.mock.calls[0][1];
    // Verify all 14 p_ params are present
    expect(callArgs).toMatchObject({
      p_id: 'svc-1',
      p_name: 'House Cleaning Pro',
      p_short_description: 'Professional clean',
      p_full_description: 'Full desc',
      p_category_id: 'cat-1',
      p_icon: '🧹',
      p_color: '#FFF',
      p_estimated_duration: '3 hours',
      p_starting_price_text: '2000',
      p_featured: true,
      p_trending: false,
      p_emergency_available: false,
      p_inspection_required: true,
      p_available_24_7: false,
    });
    // Verify NO slug param is passed
    expect(callArgs).not.toHaveProperty('p_slug');
  });

  it('returns {ok:false, error} on failure', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { code: 'XXXXX', message: 'fail' } });

    const result = await adminUpdateService({
      id: 'svc-1', name: 'X', categoryId: 'cat-1',
      featured: false, trending: false,
      emergencyAvailable: false, inspectionRequired: false, available247: false,
    });

    expect(result).toEqual({ ok: false, error: 'Could not save. Please try again.' });
  });
});

// ── adminSetServiceStatus ──────────────────────────────────────────────────

describe('adminSetServiceStatus', () => {
  it('calls admin_set_service_status with p_id and p_status', async () => {
    mockRpc.mockResolvedValue({ data: null, error: null });

    const result = await adminSetServiceStatus('svc-1', 'hidden');

    expect(result).toEqual({ ok: true });
    expect(mockRpc).toHaveBeenCalledWith('admin_set_service_status', {
      p_id: 'svc-1',
      p_status: 'hidden',
    });
  });

  it('returns {ok:false, error} on failure', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { code: 'XXXXX', message: 'fail' } });

    const result = await adminSetServiceStatus('svc-1', 'archived');

    expect(result).toEqual({ ok: false, error: 'Could not save. Please try again.' });
  });
});

// ── adminDuplicateService ──────────────────────────────────────────────────

describe('adminDuplicateService', () => {
  it('calls admin_duplicate_service with p_id and returns {ok, id}', async () => {
    mockRpc.mockResolvedValue({ data: 'dup-uuid', error: null });

    const result = await adminDuplicateService('svc-1');

    expect(result).toEqual({ ok: true, id: 'dup-uuid' });
    expect(mockRpc).toHaveBeenCalledWith('admin_duplicate_service', {
      p_id: 'svc-1',
    });
  });

  it('returns {ok:false, error} on failure', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { code: 'XXXXX', message: 'fail' } });

    const result = await adminDuplicateService('svc-1');

    expect(result).toEqual({ ok: false, error: 'Could not save. Please try again.' });
  });
});

// ── adminReorderServices ───────────────────────────────────────────────────

describe('adminReorderServices', () => {
  it('calls admin_reorder_services with p_category_id and p_ordered_ids', async () => {
    mockRpc.mockResolvedValue({ data: null, error: null });

    const ids = ['svc-1', 'svc-2', 'svc-3'];
    const result = await adminReorderServices('cat-1', ids);

    expect(result).toEqual({ ok: true });
    expect(mockRpc).toHaveBeenCalledWith('admin_reorder_services', {
      p_category_id: 'cat-1',
      p_ordered_ids: ids,
    });
  });

  it('returns {ok:false, error} on failure', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { code: 'XXXXX', message: 'fail' } });

    const result = await adminReorderServices('cat-1', ['svc-1']);

    expect(result).toEqual({ ok: false, error: 'Could not save. Please try again.' });
  });
});

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
