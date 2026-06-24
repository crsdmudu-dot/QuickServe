import {
  getMyPayments,
  getPaymentForBooking,
  adminGetAllPayments,
  adminOverridePaymentStatus,
} from '@/lib/payments';

// ── Mock Supabase ──────────────────────────────────────────────────────────

const rpc = jest.fn();
const select = jest.fn();
const order = jest.fn();
const eq = jest.fn();
const maybeSingle = jest.fn();

// Note: variables used inside jest.mock() factory must be prefixed with "mock" (Jest rule).
const mockRpc = rpc;
const mockSelect = select;
const mockOrder = order;
const mockEq = eq;
const mockMaybeSingle = maybeSingle;

jest.mock('@/lib/supabase', () => ({
  supabase: {
    rpc: (...a: unknown[]) => mockRpc(...a),
    from: () => ({
      select: (...a: unknown[]) => {
        mockSelect(...a);
        return {
          order: (...b: unknown[]) => mockOrder(...b),
          eq: (...b: unknown[]) => {
            mockEq(...b);
            return {
              maybeSingle: (...c: unknown[]) => mockMaybeSingle(...c),
            };
          },
        };
      },
    }),
  },
}));

beforeEach(() => {
  jest.clearAllMocks();
});

// ── Sample payment fixture ─────────────────────────────────────────────────

const mockPayment = {
  id: 'pay1',
  booking_id: 'bk1',
  customer_id: 'cu1',
  amount: 500,
  currency: 'USD',
  status: 'paid' as const,
  provider_share: 400,
  quickserve_share: 100,
  paid_at: '2026-06-24T10:00:00Z',
  created_at: '2026-06-24T09:00:00Z',
};

// ── getMyPayments ──────────────────────────────────────────────────────────

describe('getMyPayments', () => {
  it('returns list of payments on success', async () => {
    order.mockResolvedValue({ data: [mockPayment], error: null });
    const res = await getMyPayments();
    expect(res).toEqual([mockPayment]);
    expect(mockSelect).toHaveBeenCalledWith('*');
    expect(mockOrder).toHaveBeenCalledWith('created_at', { ascending: false });
  });

  it('returns [] on error', async () => {
    order.mockResolvedValue({ data: null, error: { message: 'DB error' } });
    const res = await getMyPayments();
    expect(res).toEqual([]);
  });

  it('returns [] when no rows', async () => {
    order.mockResolvedValue({ data: null, error: null });
    const res = await getMyPayments();
    expect(res).toEqual([]);
  });
});

// ── getPaymentForBooking ───────────────────────────────────────────────────

describe('getPaymentForBooking', () => {
  it('returns the payment on success', async () => {
    maybeSingle.mockResolvedValue({ data: mockPayment, error: null });
    const res = await getPaymentForBooking('bk1');
    expect(res).toEqual(mockPayment);
    expect(mockEq).toHaveBeenCalledWith('booking_id', 'bk1');
  });

  it('returns null on error', async () => {
    maybeSingle.mockResolvedValue({ data: null, error: { message: 'not found' } });
    const res = await getPaymentForBooking('bk1');
    expect(res).toBeNull();
  });

  it('returns null when no row found', async () => {
    maybeSingle.mockResolvedValue({ data: null, error: null });
    const res = await getPaymentForBooking('bk1');
    expect(res).toBeNull();
  });
});

// ── adminGetAllPayments ────────────────────────────────────────────────────

describe('adminGetAllPayments', () => {
  it('returns list of all payments on success', async () => {
    order.mockResolvedValue({ data: [mockPayment], error: null });
    const res = await adminGetAllPayments();
    expect(res).toEqual([mockPayment]);
    expect(mockSelect).toHaveBeenCalledWith('*');
    expect(mockOrder).toHaveBeenCalledWith('created_at', { ascending: false });
  });

  it('returns [] on error', async () => {
    order.mockResolvedValue({ data: null, error: { message: 'DB error' } });
    const res = await adminGetAllPayments();
    expect(res).toEqual([]);
  });
});

// ── adminOverridePaymentStatus ─────────────────────────────────────────────

describe('adminOverridePaymentStatus', () => {
  it('calls override_payment_status RPC with correct args on success', async () => {
    rpc.mockResolvedValue({ error: null });
    const res = await adminOverridePaymentStatus('pay1', 'refunded');
    expect(res).toEqual({ ok: true });
    expect(rpc).toHaveBeenCalledWith('override_payment_status', {
      p_payment_id: 'pay1',
      p_status: 'refunded',
    });
  });

  it('returns friendly error when RPC fails', async () => {
    rpc.mockResolvedValue({ error: { message: 'not allowed' } });
    const res = await adminOverridePaymentStatus('pay1', 'cancelled');
    expect(res).toEqual({
      ok: false,
      error: 'Could not update payment status. Please try again.',
    });
  });
});
