import {
  createBooking,
  getCustomerBookings,
  getAllBookings,
  getProviderJobs,
  getBookingById,
  updateBookingStatus,
  assignProvider,
  updateAdminNotes,
  getBookingProfessional,
  isLikelyDuplicateBooking,
  findActiveDuplicateBooking,
} from '@/lib/bookings';
import { newIdempotencyKey } from '@/lib/idempotency';
import { buildServiceDetailsSnapshot } from '@/lib/service-details';

const mockGetUser = jest.fn();
const mockInsert = jest.fn();
const mockOrder = jest.fn();
const mockRange = jest.fn();
const mockUpdate = jest.fn();
const mockUpdateEq = jest.fn();
const mockSingle = jest.fn();
const mockMaybeSingle = jest.fn();
const mockSelectEq = jest.fn();
const mockRpc = jest.fn();

jest.mock('@/lib/supabase', () => ({
  supabase: {
    auth: { getUser: (...a: unknown[]) => mockGetUser(...a) },
    from: () => ({
      insert: (...a: unknown[]) => mockInsert(...a),
      select: () => ({
        // order() returns a thenable that also exposes .range() for paginated callers.
        order: (...a: unknown[]) => {
          const promise = mockOrder(...a) as Promise<unknown>;
          // Attach .range() so paginated helpers can chain it.
          (promise as unknown as { range: (...b: unknown[]) => unknown }).range =
            (...b: unknown[]) => mockRange(...b);
          return promise;
        },
        eq: (...a: unknown[]) => mockSelectEq(...a),
      }),
      update: (...a: unknown[]) => mockUpdate(...a),
    }),
    rpc: (...a: unknown[]) => mockRpc(...a),
  },
}));

beforeEach(() => {
  jest.clearAllMocks();
  // Default: selectEq returns { single, maybeSingle } so getBookingById can chain .single()
  // and createBooking's idempotent-recovery path can chain .maybeSingle().
  mockSelectEq.mockReturnValue({
    single: (...a: unknown[]) => mockSingle(...a),
    maybeSingle: (...a: unknown[]) => mockMaybeSingle(...a),
  });
});

describe('createBooking', () => {
  it('fails when signed out', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });
    expect(await createBooking({ serviceId: 's', address: 'a', scheduledFor: 't' })).toEqual({
      ok: false, error: 'You must be signed in to book.',
    });
  });
  it('inserts with customer_id and returns ok', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } });
    mockInsert.mockReturnValue({ select: () => ({ single: () => Promise.resolve({ data: { id: 'bk1' }, error: null }) }) });
    const res = await createBooking({ serviceId: 'house-cleaning', address: 'Nairobi', scheduledFor: '2026-07-01T10:00:00Z', notes: 'gate code 12' });
    expect(res).toEqual({ ok: true, id: 'bk1' });
    expect(mockInsert).toHaveBeenCalledWith({
      customer_id: 'u1', service_id: 'house-cleaning', address: 'Nairobi',
      scheduled_for: '2026-07-01T10:00:00Z', notes: 'gate code 12',
      // Slice 20 structured address fields (undefined → null)
      address_label: null, latitude: null, longitude: null,
      building_name: null, floor: null, door_number: null,
      landmark: null, access_notes: null,
      // Slice 24 scheduling fields (defaults when not provided)
      scheduling_type: 'datetime', time_window: null, window_start: null,
      window_end: null, recurrence: 'one_time',
      // Phase 4E.2 — idempotency key is null when the caller omits it
      idempotency_key: null,
      // Service Details V1 — null when the caller omits it (pre-V1 behaviour preserved)
      service_details: null,
    });
  });
  it('inserts provided scheduling fields verbatim', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } });
    mockInsert.mockReturnValue({ select: () => ({ single: () => Promise.resolve({ data: { id: 'bk2' }, error: null }) }) });
    const res = await createBooking({
      serviceId: 'plumbing', address: 'Westlands', scheduledFor: '2026-07-05T08:00:00Z',
      scheduling_type: 'asap', time_window: 'morning',
      window_start: '2026-07-05T08:00:00Z', window_end: '2026-07-05T12:00:00Z',
      recurrence: 'weekly',
    });
    expect(res).toEqual({ ok: true, id: 'bk2' });
    expect(mockInsert).toHaveBeenCalledWith(expect.objectContaining({
      scheduling_type: 'asap', time_window: 'morning',
      window_start: '2026-07-05T08:00:00Z', window_end: '2026-07-05T12:00:00Z',
      recurrence: 'weekly',
    }));
  });
  it('maps insert error', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } });
    mockInsert.mockReturnValue({ select: () => ({ single: () => Promise.resolve({ data: null, error: { message: 'boom' } }) }) });
    expect(await createBooking({ serviceId: 's', address: 'a', scheduledFor: 't' })).toEqual({
      ok: false, error: 'Could not create booking. Please try again.',
    });
  });
  it('createBooking returns the new id on success', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } });
    mockInsert.mockReturnValue({ select: () => ({ single: () => Promise.resolve({ data: { id: 'bk1' }, error: null }) }) });
    const res = await createBooking({ serviceId: 's', address: 'a', scheduledFor: 't' });
    expect(res).toEqual({ ok: true, id: 'bk1' });
  });

  it('passes the idempotency_key through to the insert when provided', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } });
    mockInsert.mockReturnValue({ select: () => ({ single: () => Promise.resolve({ data: { id: 'bk9' }, error: null }) }) });
    await createBooking({ serviceId: 's', address: 'a', scheduledFor: 't', idempotencyKey: 'idem-123' });
    expect(mockInsert).toHaveBeenCalledWith(expect.objectContaining({ idempotency_key: 'idem-123' }));
  });

  // ── Service Details V1 ──────────────────────────────────────────────────
  it('persists the service_details snapshot when provided', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } });
    mockInsert.mockReturnValue({ select: () => ({ single: () => Promise.resolve({ data: { id: 'bk10' }, error: null }) }) });
    const service_details = buildServiceDetailsSnapshot({
      formVersion: 1,
      serviceSlug: 'house-cleaning',
      serviceTitle: 'House Cleaning',
      primaryKind: 'variant',
      primary: { key: 'variant', question: 'What kind of cleaning?', kind: 'single', value: 'deep', display: 'Deep clean' },
    });
    const res = await createBooking({ serviceId: 'house-cleaning', address: 'a', scheduledFor: 't', service_details });
    expect(res).toEqual({ ok: true, id: 'bk10' });
    expect(mockInsert).toHaveBeenCalledWith(expect.objectContaining({ service_details }));
  });

  it('stores service_details as null when the caller omits it (pre-V1 callers unaffected)', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } });
    mockInsert.mockReturnValue({ select: () => ({ single: () => Promise.resolve({ data: { id: 'bk11' }, error: null }) }) });
    await createBooking({ serviceId: 's', address: 'a', scheduledFor: 't' });
    expect(mockInsert).toHaveBeenCalledWith(expect.objectContaining({ service_details: null }));
  });

  it('service_details does not disturb idempotent recovery', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } });
    mockInsert.mockReturnValue({ select: () => ({ single: () => Promise.resolve({ data: null, error: { code: '23505', message: 'duplicate key value violates unique constraint "bookings_idempotency_key_uidx"' } }) }) });
    mockMaybeSingle.mockResolvedValue({ data: { id: 'bk-existing' }, error: null });
    const service_details = buildServiceDetailsSnapshot({
      formVersion: 1, serviceSlug: 's', serviceTitle: 'S', primaryKind: 'issue',
      primary: { key: 'issue', question: 'Q', kind: 'single', value: 'leak', display: 'Leak' },
    });
    const res = await createBooking({ serviceId: 's', address: 'a', scheduledFor: 't', idempotencyKey: 'idem-123', service_details });
    expect(res).toEqual({ ok: true, id: 'bk-existing', recovered: true });
  });

  it('RECOVERS the existing booking on a unique-violation retry (same idempotency key) — no second row, no error', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } });
    // Insert raises 23505 (the key already created a booking on the first, timed-out attempt).
    mockInsert.mockReturnValue({ select: () => ({ single: () => Promise.resolve({ data: null, error: { code: '23505', message: 'duplicate key value violates unique constraint "bookings_idempotency_key_uidx"' } }) }) });
    // Recovery select(...).eq('idempotency_key', ...).maybeSingle() returns the existing booking.
    mockMaybeSingle.mockResolvedValue({ data: { id: 'bk-existing' }, error: null });
    const res = await createBooking({ serviceId: 's', address: 'a', scheduledFor: 't', idempotencyKey: 'idem-123' });
    expect(res).toEqual({ ok: true, id: 'bk-existing', recovered: true });
    expect(mockSelectEq).toHaveBeenCalledWith('idempotency_key', 'idem-123');
  });

  it('returns a normal error on 23505 when no idempotency key was used (cannot recover)', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } });
    mockInsert.mockReturnValue({ select: () => ({ single: () => Promise.resolve({ data: null, error: { code: '23505', message: 'duplicate key' } }) }) });
    expect(await createBooking({ serviceId: 's', address: 'a', scheduledFor: 't' })).toEqual({
      ok: false, error: 'Could not create booking. Please try again.',
    });
  });
});

describe('newIdempotencyKey', () => {
  it('returns a UUID-shaped string and a different value each call', () => {
    const a = newIdempotencyKey();
    expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
    expect(newIdempotencyKey()).not.toBe(a);
  });
});

describe('isLikelyDuplicateBooking (business matcher)', () => {
  const base = {
    id: 'e1', service_id: 'plumbing', status: 'pending' as const,
    address: 'Yaya Towers, Nairobi', building_name: 'Yaya Towers', floor: '7', door_number: '7B',
  };
  const input = { serviceId: 'plumbing', address: 'Yaya Towers, Nairobi', building_name: 'Yaya Towers', floor: '7', door_number: '7B' };

  it('Case D — same service + same active destination/unit → duplicate', () => {
    expect(isLikelyDuplicateBooking(base as never, input)).toBe(true);
  });
  it('Case C — different unit (door 8A vs 7B) → NOT duplicate', () => {
    expect(isLikelyDuplicateBooking({ ...base, door_number: '8A' } as never, input)).toBe(false);
  });
  it('Case B — different address → NOT duplicate', () => {
    expect(isLikelyDuplicateBooking({ ...base, address: 'Kilimani, Nairobi' } as never, input)).toBe(false);
  });
  it('Case A — different service → NOT duplicate', () => {
    expect(isLikelyDuplicateBooking(base as never, { ...input, serviceId: 'house-cleaning' })).toBe(false);
  });
  it('Case J — completed/cancelled existing → NOT duplicate', () => {
    expect(isLikelyDuplicateBooking({ ...base, status: 'completed' } as never, input)).toBe(false);
    expect(isLikelyDuplicateBooking({ ...base, status: 'cancelled' } as never, input)).toBe(false);
  });
  it('does not force-match when the new address is blank', () => {
    expect(isLikelyDuplicateBooking(base as never, { ...input, address: '' })).toBe(false);
  });
  it('case-insensitive + trims when comparing destination fields', () => {
    expect(isLikelyDuplicateBooking({ ...base, door_number: ' 7b ' } as never, input)).toBe(true);
  });
});

describe('findActiveDuplicateBooking', () => {
  const input = { serviceId: 'plumbing', address: 'Yaya Towers, Nairobi', building_name: 'Yaya Towers', floor: '7', door_number: '7B' };
  it('returns the matching active booking from the caller-own list', async () => {
    // getCustomerBookings(0, 50) chains order().range(): the mock attaches .range onto order()'s
    // return, so mockOrder must yield an object; the awaited value comes from mockRange.
    mockOrder.mockResolvedValue({ data: [], error: null });
    mockRange.mockResolvedValue({ data: [
      { id: 'x', service_id: 'house-cleaning', status: 'pending', address: 'Yaya Towers, Nairobi', building_name: 'Yaya Towers', floor: '7', door_number: '7B' },
      { id: 'dup', service_id: 'plumbing', status: 'pending', address: 'Yaya Towers, Nairobi', building_name: 'Yaya Towers', floor: '7', door_number: '7B' },
    ], error: null });
    const res = await findActiveDuplicateBooking(input);
    expect(res?.id).toBe('dup');
  });
  it('returns null when nothing matches', async () => {
    mockOrder.mockResolvedValue({ data: [], error: null });
    mockRange.mockResolvedValue({ data: [
      { id: 'y', service_id: 'plumbing', status: 'pending', address: 'Kilimani', building_name: '', floor: '', door_number: '' },
    ], error: null });
    expect(await findActiveDuplicateBooking(input)).toBeNull();
  });
});

describe('getCustomerBookings', () => {
  it('returns rows newest-first, [] when none', async () => {
    mockOrder.mockResolvedValue({ data: [{ id: 'b1' }], error: null });
    expect(await getCustomerBookings()).toEqual([{ id: 'b1' }]);
    mockOrder.mockResolvedValue({ data: null, error: null });
    expect(await getCustomerBookings()).toEqual([]);
  });
});

describe('getAllBookings', () => {
  it('returns rows newest-first', async () => {
    mockOrder.mockResolvedValue({ data: [{ id: 'b1' }], error: null });
    expect(await getAllBookings()).toEqual([{ id: 'b1' }]);
  });
});

describe('updateBookingStatus', () => {
  it('updates by id and returns ok', async () => {
    mockUpdate.mockReturnValue({ eq: (...a: unknown[]) => mockUpdateEq(...a) });
    mockUpdateEq.mockResolvedValue({ error: null });
    expect(await updateBookingStatus('b1', 'accepted')).toEqual({ ok: true });
    expect(mockUpdate).toHaveBeenCalledWith({ status: 'accepted' });
    expect(mockUpdateEq).toHaveBeenCalledWith('id', 'b1');
  });
});

describe('assignProvider', () => {
  it('sets columns + provider_assigned', async () => {
    mockUpdate.mockReturnValue({ eq: (...a: unknown[]) => mockUpdateEq(...a) });
    mockUpdateEq.mockResolvedValue({ error: null });
    expect(await assignProvider('b1', { name: 'Jane', phone: '0700' })).toEqual({ ok: true });
    expect(mockUpdate).toHaveBeenCalledWith({
      assigned_provider_id: null, assigned_provider_name: 'Jane',
      assigned_provider_phone: '0700', status: 'provider_assigned',
    });
  });
  it('getProviderJobs returns rows newest-first', async () => {
    mockOrder.mockResolvedValue({ data: [{ id: 'j1' }], error: null });
    expect(await getProviderJobs()).toEqual([{ id: 'j1' }]);
  });
  it('assignProvider (manual) clears assigned_provider_id', async () => {
    mockUpdate.mockReturnValue({ eq: (...a: unknown[]) => mockUpdateEq(...a) });
    mockUpdateEq.mockResolvedValue({ error: null });
    await assignProvider('b1', { name: 'Jane', phone: '0700' });
    expect(mockUpdate).toHaveBeenCalledWith({
      assigned_provider_id: null, assigned_provider_name: 'Jane',
      assigned_provider_phone: '0700', status: 'provider_assigned',
    });
  });
  it('assignProvider (in-app) sets assigned_provider_id', async () => {
    mockUpdate.mockReturnValue({ eq: (...a: unknown[]) => mockUpdateEq(...a) });
    mockUpdateEq.mockResolvedValue({ error: null });
    await assignProvider('b1', { name: 'Jane', phone: '0700', providerId: 'p1' });
    expect(mockUpdate).toHaveBeenCalledWith({
      assigned_provider_id: 'p1', assigned_provider_name: 'Jane',
      assigned_provider_phone: '0700', status: 'provider_assigned',
    });
  });
});

describe('updateAdminNotes', () => {
  it('updates notes', async () => {
    mockUpdate.mockReturnValue({ eq: (...a: unknown[]) => mockUpdateEq(...a) });
    mockUpdateEq.mockResolvedValue({ error: null });
    expect(await updateAdminNotes('b1', 'call gate')).toEqual({ ok: true });
    expect(mockUpdate).toHaveBeenCalledWith({ admin_notes: 'call gate' });
  });
});

describe('getBookingById', () => {
  it('returns row or null', async () => {
    mockSingle.mockResolvedValue({ data: { id: 'b1' }, error: null });
    expect(await getBookingById('b1')).toEqual({ id: 'b1' });
    mockSingle.mockResolvedValue({ data: null, error: { message: 'x' } });
    expect(await getBookingById('b1')).toBeNull();
  });
});

describe('getBookingProfessional', () => {
  it('returns the first rpc row or null', async () => {
    mockRpc.mockResolvedValue({ data: [{ full_name: 'Jane', skills: ['Plumbing'], is_verified: true, completed_jobs_count: 5, profile_photo_url: null }], error: null });
    expect(await getBookingProfessional('b1')).toEqual({ full_name: 'Jane', skills: ['Plumbing'], is_verified: true, completed_jobs_count: 5, profile_photo_url: null });
    expect(mockRpc).toHaveBeenCalledWith('get_booking_professional', { p_booking_id: 'b1' });
    mockRpc.mockResolvedValue({ data: [], error: null });
    expect(await getBookingProfessional('b1')).toBeNull();
  });
});

// ── Pagination tests ───────────────────────────────────────────────────────

describe('getAllBookings pagination', () => {
  it('calls .range(10, 19) when called with page=1, pageSize=10', async () => {
    mockRange.mockResolvedValue({ data: [{ id: 'b2' }], error: null });
    const result = await getAllBookings(1, 10);
    expect(mockRange).toHaveBeenCalledWith(10, 19);
    expect(result).toEqual([{ id: 'b2' }]);
  });

  it('does NOT call .range when called with no args (no-arg stays green)', async () => {
    mockOrder.mockResolvedValue({ data: [{ id: 'b1' }], error: null });
    const result = await getAllBookings();
    expect(result).toEqual([{ id: 'b1' }]);
    expect(mockRange).not.toHaveBeenCalled();
  });
});

describe('getCustomerBookings pagination', () => {
  it('calls .range(10, 19) when called with page=1, pageSize=10', async () => {
    mockRange.mockResolvedValue({ data: [{ id: 'b2' }], error: null });
    const result = await getCustomerBookings(1, 10);
    expect(mockRange).toHaveBeenCalledWith(10, 19);
    expect(result).toEqual([{ id: 'b2' }]);
  });

  it('does NOT call .range when called with no args', async () => {
    mockOrder.mockResolvedValue({ data: [{ id: 'b1' }], error: null });
    const result = await getCustomerBookings();
    expect(result).toEqual([{ id: 'b1' }]);
    expect(mockRange).not.toHaveBeenCalled();
  });
});

describe('getProviderJobs pagination', () => {
  it('calls .range(10, 19) when called with page=1, pageSize=10', async () => {
    mockRange.mockResolvedValue({ data: [{ id: 'j2' }], error: null });
    const result = await getProviderJobs(1, 10);
    expect(mockRange).toHaveBeenCalledWith(10, 19);
    expect(result).toEqual([{ id: 'j2' }]);
  });

  it('does NOT call .range when called with no args', async () => {
    mockOrder.mockResolvedValue({ data: [{ id: 'j1' }], error: null });
    const result = await getProviderJobs();
    expect(result).toEqual([{ id: 'j1' }]);
    expect(mockRange).not.toHaveBeenCalled();
  });
});
