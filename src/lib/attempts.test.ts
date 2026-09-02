import {
  initiateMpesaPayment,
  getPaymentAttempts,
  adminGetPaymentAttempts,
  adminConfirmAttempt,
  adminReconcileAttemptNoCollection,
} from '@/lib/attempts';

// ── Mock Supabase ──────────────────────────────────────────────────────────

const rpc = jest.fn();
const select = jest.fn();
const order = jest.fn();
const eq = jest.fn();
const invoke = jest.fn();

// Note: variables used inside jest.mock() factory must be prefixed with "mock" (Jest rule).
const mockRpc = rpc;
const mockSelect = select;
const mockOrder = order;
const mockEq = eq;
const mockInvoke = invoke;

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
    functions: { invoke: (...a: unknown[]) => mockInvoke(...a) },
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
  it('returns error and does NOT call functions.invoke for a bad phone number', async () => {
    const res = await initiateMpesaPayment({
      paymentId: 'pay1',
      amount: 1500,
      phone: '12345',
      accountReference: 'bk1',
    });
    expect(res).toEqual({ ok: false, error: 'Enter a valid M-Pesa phone number.' });
    expect(mockInvoke).not.toHaveBeenCalled();
  });

  it('calls mpesa-stk-push with normalized phone and returns ok:true on success', async () => {
    invoke.mockResolvedValue({ data: { ok: true, checkoutRequestId: 'ws_CO_1' }, error: null });
    const res = await initiateMpesaPayment({
      paymentId: 'pay1',
      amount: 1500,
      phone: '0712345678',
      accountReference: 'bk1',
    });
    expect(res).toEqual({ ok: true });
    expect(mockInvoke).toHaveBeenCalledWith('mpesa-stk-push', {
      body: { payment_id: 'pay1', phone: '254712345678' },
    });
  });

  it('returns friendly error when invoke transport fails', async () => {
    invoke.mockResolvedValue({ data: null, error: { message: 'boom' } });
    const res = await initiateMpesaPayment({
      paymentId: 'pay1',
      amount: 1500,
      phone: '0712345678',
      accountReference: 'bk1',
    });
    expect(res).toEqual({ ok: false, error: 'Could not start payment. Please try again.' });
  });

  it('surfaces server business error string when data.ok is false', async () => {
    invoke.mockResolvedValue({ data: { ok: false, error: 'Payment is not pending.' }, error: null });
    const res = await initiateMpesaPayment({
      paymentId: 'pay1',
      amount: 1500,
      phone: '0712345678',
      accountReference: 'bk1',
    });
    expect(res).toEqual({ ok: false, error: 'Payment is not pending.' });
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

// ── adminConfirmAttempt (0045: evidence-bearing) ────────────────────────

describe('adminConfirmAttempt', () => {
  it('sends all four evidence arguments to confirm_payment_attempt', async () => {
    rpc.mockResolvedValue({ error: null });
    const res = await adminConfirmAttempt('att1', 4000, 'Verified in Daraja portal', 'NLJ7RT61SV');
    expect(res).toEqual({ ok: true });
    expect(mockRpc).toHaveBeenCalledWith('confirm_payment_attempt', {
      p_attempt_id: 'att1',
      p_collected_amount: 4000,
      p_confirmation_note: 'Verified in Daraja portal',
      p_confirmation_reference: 'NLJ7RT61SV',
    });
  });

  it('passes a null reference through unchanged (cash has no provider receipt)', async () => {
    rpc.mockResolvedValue({ error: null });
    await adminConfirmAttempt('att2', 1500, 'Cash handed over at site', null);
    expect(mockRpc).toHaveBeenCalledWith('confirm_payment_attempt', {
      p_attempt_id: 'att2',
      p_collected_amount: 1500,
      p_confirmation_note: 'Cash handed over at site',
      p_confirmation_reference: null,
    });
  });

  it('returns friendly error when RPC fails', async () => {
    rpc.mockResolvedValue({ error: { message: 'not allowed' } });
    const res = await adminConfirmAttempt('att1', 4000, 'note', 'REF');
    expect(res).toEqual({
      ok: false,
      error: 'Could not confirm payment. Please try again.',
    });
  });
});

// ── adminReconcileAttemptNoCollection (0045: replaces cancel) ───────────────

describe('adminReconcileAttemptNoCollection', () => {
  it('calls reconcile_payment_attempt_no_collection with note and reference', async () => {
    rpc.mockResolvedValue({ error: null });
    const res = await adminReconcileAttemptNoCollection(
      'att1',
      'Daraja shows no transaction',
      'CASE-1234',
    );
    expect(res).toEqual({ ok: true });
    expect(mockRpc).toHaveBeenCalledWith('reconcile_payment_attempt_no_collection', {
      p_attempt_id: 'att1',
      p_reconciliation_note: 'Daraja shows no transaction',
      p_provider_reference: 'CASE-1234',
    });
  });

  it('never calls the removed cancel_payment_attempt RPC', async () => {
    rpc.mockResolvedValue({ error: null });
    await adminReconcileAttemptNoCollection('att1', 'note', null);
    expect(mockRpc).not.toHaveBeenCalledWith('cancel_payment_attempt', expect.anything());
  });

  it('returns friendly error when RPC fails', async () => {
    rpc.mockResolvedValue({ error: { message: 'not allowed' } });
    const res = await adminReconcileAttemptNoCollection('att1', 'note', null);
    expect(res).toEqual({
      ok: false,
      error: 'Could not reconcile attempt. Please try again.',
    });
  });
});
