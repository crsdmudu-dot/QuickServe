/**
 * Tests for src/lib/cancellation.ts (Update 74): the call to customer_cancel_booking and how each server
 * answer, error or lost answer becomes one of the five results the screens handle; and the admin read.
 */
import { cancelBooking, getBookingCancellation, parseCancelAnswer } from '@/lib/cancellation';

const mockRpc = jest.fn();
const mockMaybeSingle = jest.fn();
const mockEq = jest.fn(() => ({ maybeSingle: mockMaybeSingle }));
const mockSelect = jest.fn(() => ({ eq: mockEq }));
const mockFrom = jest.fn(() => ({ select: mockSelect }));
jest.mock('@/lib/supabase', () => ({
  supabase: {
    rpc: (...args: unknown[]) => mockRpc(...args),
    from: (...args: unknown[]) => (mockFrom as (...a: unknown[]) => unknown)(...args),
  },
}));

const KEY = '11111111-2222-4333-8444-555555555555';

describe('cancelBooking', () => {
  beforeEach(() => mockRpc.mockReset());

  it('sends the booking, the reason and the request key to customer_cancel_booking', async () => {
    mockRpc.mockResolvedValue({ data: { ok: true, outcome: 'cancelled', payment: 'none', provider_notified: true }, error: null });
    await expect(cancelBooking('b1', 'plans_changed', KEY)).resolves.toEqual({
      kind: 'cancelled',
      providerNotified: true,
      manualProvider: false,
      paymentClosed: false,
    });
    expect(mockRpc).toHaveBeenCalledWith('customer_cancel_booking', {
      p_booking_id: 'b1',
      p_reason_code: 'plans_changed',
      p_idempotency_key: KEY,
    });
  });

  it('a missing reason is sent as null', async () => {
    mockRpc.mockResolvedValue({ data: { ok: true, outcome: 'cancelled', payment: 'cancelled' }, error: null });
    await expect(cancelBooking('b1', null, KEY)).resolves.toEqual({
      kind: 'cancelled',
      providerNotified: false,
      manualProvider: false,
      paymentClosed: true,
    });
    expect(mockRpc.mock.calls[0][1]).toEqual({ p_booking_id: 'b1', p_reason_code: null, p_idempotency_key: KEY });
  });

  it('a manually dispatched provider is reported, so the result can say we will let them know', async () => {
    mockRpc.mockResolvedValue({
      data: { ok: true, outcome: 'cancelled', payment: 'none', provider_notified: false, manual_provider: true },
      error: null,
    });
    await expect(cancelBooking('b1', null, KEY)).resolves.toEqual({
      kind: 'cancelled',
      providerNotified: false,
      manualProvider: true,
      paymentClosed: false,
    });
  });

  it('every refusal code is passed on', async () => {
    for (const code of ['work_started', 'completed', 'needs_support', 'payment_in_progress', 'payment_recorded', 'not_found', 'invalid_request']) {
      mockRpc.mockResolvedValueOnce({ data: { ok: false, code }, error: null });
      await expect(cancelBooking('b1', null, KEY)).resolves.toEqual({ kind: 'refused', code });
    }
  });

  it('already cancelled: by whom, and whether it was this same request', async () => {
    mockRpc.mockResolvedValueOnce({ data: { ok: true, outcome: 'already_cancelled', cancelled_by: 'you', same_request: true }, error: null });
    await expect(cancelBooking('b1', null, KEY)).resolves.toEqual({ kind: 'already_cancelled', by: 'you', sameRequest: true });
    mockRpc.mockResolvedValueOnce({ data: { ok: true, outcome: 'already_cancelled', cancelled_by: 'kwikserve', same_request: false }, error: null });
    await expect(cancelBooking('b1', null, KEY)).resolves.toEqual({ kind: 'already_cancelled', by: 'kwikserve', sameRequest: false });
  });

  it('a missing function, a refused EXECUTE (the off-switch) or an account problem means Get help', async () => {
    for (const error of [
      { code: 'PGRST202', message: 'Could not find the function' },
      { code: '42501', message: 'permission denied for function customer_cancel_booking' },
      { code: 'P0001', message: 'not_allowed' },
    ]) {
      mockRpc.mockResolvedValueOnce({ data: null, error });
      await expect(cancelBooking('b1', null, KEY)).resolves.toEqual({ kind: 'unavailable' });
    }
  });

  it('a lost answer (other error, or a thrown network failure) means "try again with the same key"', async () => {
    mockRpc.mockResolvedValueOnce({ data: null, error: { code: '', message: 'TypeError: Network request failed' } });
    await expect(cancelBooking('b1', null, KEY)).resolves.toEqual({ kind: 'network' });
    mockRpc.mockRejectedValueOnce(new Error('offline'));
    await expect(cancelBooking('b1', null, KEY)).resolves.toEqual({ kind: 'network' });
  });

  it('an answer of an unknown shape is treated as unavailable, never as success', () => {
    expect(parseCancelAnswer(null)).toEqual({ kind: 'unavailable' });
    expect(parseCancelAnswer({ ok: true, outcome: 'something_new' })).toEqual({ kind: 'unavailable' });
    expect(parseCancelAnswer({ ok: false, code: 'unknown_code' })).toEqual({ kind: 'unavailable' });
  });
});

describe('getBookingCancellation (admin read)', () => {
  beforeEach(() => {
    mockMaybeSingle.mockReset();
    mockFrom.mockClear();
  });

  it('reads booking_cancellations by booking id', async () => {
    mockMaybeSingle.mockResolvedValue({ data: { booking_id: 'b1', from_status: 'pending' }, error: null });
    await expect(getBookingCancellation('b1')).resolves.toEqual({ booking_id: 'b1', from_status: 'pending' });
    expect(mockFrom).toHaveBeenCalledWith('booking_cancellations');
    expect(mockEq).toHaveBeenCalledWith('booking_id', 'b1');
  });

  it('returns null when there is no row or the read fails', async () => {
    mockMaybeSingle.mockResolvedValueOnce({ data: null, error: null });
    await expect(getBookingCancellation('b1')).resolves.toBeNull();
    mockMaybeSingle.mockResolvedValueOnce({ data: null, error: { message: 'x' } });
    await expect(getBookingCancellation('b1')).resolves.toBeNull();
  });
});
