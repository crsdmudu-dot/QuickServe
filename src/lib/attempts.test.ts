import {
  initiateMpesaPayment,
  getPaymentAttempts,
  adminGetPaymentAttempts,
  adminConfirmAttempt,
  adminCancelAttempt,
} from '@/lib/attempts';

// ── Mock Supabase ──────────────────────────────────────────────────────────

const rpc = jest.fn();
const select = jest.fn();
const order = jest.fn();
const eq = jest.fn();

// Note: variables used inside jest.mock() factory must be prefixed with "mock" (Jest rule).
const mockRpc = rpc;
const mockSelect = select;
const mockOrder = order;
const mockEq = eq;

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
              order: (...c: unknown[]) => mockOrder(...c),
            };
          },
        };
      },
    }),
  },
}));

// mpesa.ts is a pure module — we use the REAL implementation, no mock.

beforeEach(() => {
  jest.clearAllMocks();
});

// ── Sample fixture ─────────────────────────────────────────────────────────

const mockAttempt = {
  id: 'att1',
  payment_id: 'pay1',
  provider: 'mpesa' as const,
  phone: '254712345678',
  amount: 500,
  status: 'initiated' as const,
  external_reference: 'MOCK-abc123',
  raw_response: {},
  created_at: '2026-06-24T09:00:00Z',
};

// ── initiateMpesaPayment ───────────────────────────────────────────────────

describe('initiateMpesaPayment', () => {
  it('returns error and does NOT call supabase.rpc for a bad phone number', async () => {
    const res = await initiateMpesaPayment({
      paymentId: 'pay1',
      amount: 500,
      phone: '12345',
      accountReference: 'bk1',
    });
    expect(res).toEqual({ ok: false, error: 'Enter a valid M-Pesa phone number.' });
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('calls initiate_payment_attempt RPC with correct args on success', async () => {
    rpc.mockResolvedValue({ error: null });
    const res = await initiateMpesaPayment({
      paymentId: 'pay1',
      amount: 500,
      phone: '0712345678',
      accountReference: 'bk1',
    });
    expect(res).toEqual({ ok: true });
    expect(mockRpc).toHaveBeenCalledWith(
      'initiate_payment_attempt',
      expect.objectContaining({
        p_payment_id: 'pay1',
        p_provider: 'mpesa',
        p_phone: '254712345678',
        p_external_reference: expect.stringMatching(/^MOCK-/),
        p_raw_response: expect.any(Object),
      }),
    );
  });

  it('returns friendly error when RPC fails', async () => {
    rpc.mockResolvedValue({ error: { message: 'db error' } });
    const res = await initiateMpesaPayment({
      paymentId: 'pay1',
      amount: 500,
      phone: '0712345678',
      accountReference: 'bk1',
    });
    expect(res).toEqual({
      ok: false,
      error: 'Could not start payment. Please try again.',
    });
  });
});

// ── getPaymentAttempts ─────────────────────────────────────────────────────

describe('getPaymentAttempts', () => {
  it('returns rows and calls .eq with the payment_id', async () => {
    order.mockResolvedValue({ data: [mockAttempt], error: null });
    const res = await getPaymentAttempts('pay1');
    expect(res).toEqual([mockAttempt]);
    expect(mockEq).toHaveBeenCalledWith('payment_id', 'pay1');
    expect(mockOrder).toHaveBeenCalledWith('created_at', { ascending: false });
  });

  it('returns [] on error', async () => {
    order.mockResolvedValue({ data: null, error: { message: 'DB error' } });
    const res = await getPaymentAttempts('pay1');
    expect(res).toEqual([]);
  });
});

// ── adminGetPaymentAttempts ────────────────────────────────────────────────

describe('adminGetPaymentAttempts', () => {
  it('returns all rows on success', async () => {
    order.mockResolvedValue({ data: [mockAttempt], error: null });
    const res = await adminGetPaymentAttempts();
    expect(res).toEqual([mockAttempt]);
    expect(mockSelect).toHaveBeenCalledWith('*');
    expect(mockOrder).toHaveBeenCalledWith('created_at', { ascending: false });
  });

  it('returns [] on error', async () => {
    order.mockResolvedValue({ data: null, error: { message: 'DB error' } });
    const res = await adminGetPaymentAttempts();
    expect(res).toEqual([]);
  });
});

// ── adminConfirmAttempt ────────────────────────────────────────────────────

describe('adminConfirmAttempt', () => {
  it('calls confirm_payment_attempt RPC with correct args on success', async () => {
    rpc.mockResolvedValue({ error: null });
    const res = await adminConfirmAttempt('att1');
    expect(res).toEqual({ ok: true });
    expect(mockRpc).toHaveBeenCalledWith('confirm_payment_attempt', {
      p_attempt_id: 'att1',
    });
  });

  it('returns friendly error when RPC fails', async () => {
    rpc.mockResolvedValue({ error: { message: 'not allowed' } });
    const res = await adminConfirmAttempt('att1');
    expect(res).toEqual({
      ok: false,
      error: 'Could not confirm payment. Please try again.',
    });
  });
});

// ── adminCancelAttempt ─────────────────────────────────────────────────────

describe('adminCancelAttempt', () => {
  it('calls cancel_payment_attempt RPC with correct args on success', async () => {
    rpc.mockResolvedValue({ error: null });
    const res = await adminCancelAttempt('att1');
    expect(res).toEqual({ ok: true });
    expect(mockRpc).toHaveBeenCalledWith('cancel_payment_attempt', {
      p_attempt_id: 'att1',
    });
  });

  it('returns friendly error when RPC fails', async () => {
    rpc.mockResolvedValue({ error: { message: 'not allowed' } });
    const res = await adminCancelAttempt('att1');
    expect(res).toEqual({
      ok: false,
      error: 'Could not cancel attempt. Please try again.',
    });
  });
});
