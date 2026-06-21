import {
  createBooking,
  getCustomerBookings,
  getAllBookings,
  getBookingById,
  updateBookingStatus,
  assignProvider,
  updateAdminNotes,
} from '@/lib/bookings';

const mockGetUser = jest.fn();
const mockInsert = jest.fn();
const mockOrder = jest.fn();
const mockUpdate = jest.fn();
const mockUpdateEq = jest.fn();
const mockSingle = jest.fn();
const mockSelectEq = jest.fn();

jest.mock('@/lib/supabase', () => ({
  supabase: {
    auth: { getUser: (...a: unknown[]) => mockGetUser(...a) },
    from: () => ({
      insert: (...a: unknown[]) => mockInsert(...a),
      select: () => ({
        order: (...a: unknown[]) => mockOrder(...a),
        eq: (...a: unknown[]) => mockSelectEq(...a),
      }),
      update: (...a: unknown[]) => mockUpdate(...a),
    }),
  },
}));

beforeEach(() => {
  jest.clearAllMocks();
  // Default: selectEq returns { single } so getBookingById can chain .single()
  mockSelectEq.mockReturnValue({ single: (...a: unknown[]) => mockSingle(...a) });
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
      assigned_provider_name: 'Jane', assigned_provider_phone: '0700', status: 'provider_assigned',
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
