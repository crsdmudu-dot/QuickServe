import { createBooking, getCustomerBookings } from '@/lib/bookings';

const mockGetUser = jest.fn();
const mockInsert = jest.fn();
const mockOrder = jest.fn();

jest.mock('@/lib/supabase', () => ({
  supabase: {
    auth: { getUser: (...a: unknown[]) => mockGetUser(...a) },
    from: () => ({
      insert: (...a: unknown[]) => mockInsert(...a),
      select: () => ({ order: (...a: unknown[]) => mockOrder(...a) }),
    }),
  },
}));

beforeEach(() => jest.clearAllMocks());

describe('createBooking', () => {
  it('fails when signed out', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });
    expect(await createBooking({ serviceId: 's', address: 'a', scheduledFor: 't' })).toEqual({
      ok: false, error: 'You must be signed in to book.',
    });
  });
  it('inserts with customer_id and returns ok', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } });
    mockInsert.mockResolvedValue({ error: null });
    const res = await createBooking({ serviceId: 'house-cleaning', address: 'Nairobi', scheduledFor: '2026-07-01T10:00:00Z', notes: 'gate code 12' });
    expect(res).toEqual({ ok: true });
    expect(mockInsert).toHaveBeenCalledWith({
      customer_id: 'u1', service_id: 'house-cleaning', address: 'Nairobi',
      scheduled_for: '2026-07-01T10:00:00Z', notes: 'gate code 12',
    });
  });
  it('maps insert error', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } });
    mockInsert.mockResolvedValue({ error: { message: 'boom' } });
    expect(await createBooking({ serviceId: 's', address: 'a', scheduledFor: 't' })).toEqual({
      ok: false, error: 'Could not create booking. Please try again.',
    });
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
