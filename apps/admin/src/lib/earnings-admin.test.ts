/**
 * earnings-admin.test.ts — admin-only earnings tests.
 *
 * These describe blocks moved verbatim from src/lib/earnings.test.ts when the admin-only
 * exports were split out of the shared @/lib/earnings module into the admin application.
 * Only the import specifier changed; every assertion is unchanged, so coverage is preserved.
 */


import {
  adminGetAllEarnings,
  adminGetProviderEarnings,
  adminRecordProviderDeduction,
  adminRecordProviderPayout,
  adminReverseProviderDeduction,
} from '@admin/lib/earnings-admin';

// ── Mock Supabase ──────────────────────────────────────────────────────────
// `select()` must be BOTH awaitable (the security_invoker ledger view is read directly) and
// chainable with .order()/.eq() (the base tables are). A promise with methods attached satisfies
// both without changing call sites.

const rpc = jest.fn();
const select = jest.fn();
const order = jest.fn();
const eq = jest.fn();

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
        const p: any = Promise.resolve(mockSelectResult);
        p.order = (...b: unknown[]) => mockOrder(...b);
        p.eq = (...b: unknown[]) => {
          mockEq(...b);
          const q: any = Promise.resolve(mockSelectResult);
          q.order = (...c: unknown[]) => mockOrder(...c);
          return q;
        };
        return p;
      },
    }),
  },
}));

/** Result returned by a direct `await select()` — set per test. */
let mockSelectResult: { data: unknown; error: unknown } = { data: [], error: null };

beforeEach(() => {
  jest.clearAllMocks();
  mockSelectResult = { data: [], error: null };
});



describe('adminGetProviderEarnings / adminGetAllEarnings', () => {
  it('scopes provider earnings by provider_id', async () => {
    order.mockResolvedValue({ data: [], error: null });
    await adminGetProviderEarnings('prov1');
    expect(mockEq).toHaveBeenCalledWith('provider_id', 'prov1');
  });

  it('returns [] on error for all earnings', async () => {
    order.mockResolvedValue({ data: null, error: { message: 'boom' } });
    expect(await adminGetAllEarnings()).toEqual([]);
  });
});

describe('adminRecordProviderDeduction', () => {
  it('calls record_provider_deduction with trimmed reason', async () => {
    rpc.mockResolvedValue({ data: { earning_id: 'earn1' }, error: null });
    const res = await adminRecordProviderDeduction({
      earningId: 'earn1',
      amount: 100,
      category: 'service_issue',
      reason: '  damaged sink  ',
    });
    expect(res.ok).toBe(true);
    expect(rpc).toHaveBeenCalledWith('record_provider_deduction', {
      p_earning_id: 'earn1',
      p_amount: 100,
      p_category: 'service_issue',
      p_reason: 'damaged sink',
    });
  });

  it('surfaces the server refusal message', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'Deductions exceed provider entitlement' } });
    const res = await adminRecordProviderDeduction({
      earningId: 'earn1',
      amount: 1,
      category: 'service_issue',
      reason: 'x',
    });
    expect(res).toEqual({ ok: false, error: 'Deductions exceed provider entitlement' });
  });
});

describe('adminReverseProviderDeduction', () => {
  it('uses the dedicated reversal RPC and supplies only id and reason', async () => {
    rpc.mockResolvedValue({ data: { earning_id: 'earn1' }, error: null });
    await adminReverseProviderDeduction({ deductionId: 'd1', reason: 'entered in error' });
    expect(rpc).toHaveBeenCalledWith('reverse_provider_deduction', {
      p_deduction_id: 'd1',
      p_reason: 'entered in error',
    });
  });
});

describe('adminRecordProviderPayout', () => {
  it('passes the supplied idempotency key straight through', async () => {
    rpc.mockResolvedValue({ data: { payout_id: 'p1', idempotent_replay: false }, error: null });
    await adminRecordProviderPayout({
      earningId: 'earn1',
      amount: 500,
      method: 'mpesa_manual',
      reference: 'ABC123',
      note: null,
      idempotencyKey: 'key-123',
      paidAt: '2026-08-30T10:00:00Z',
    });
    expect(rpc).toHaveBeenCalledWith('record_provider_payout', {
      p_earning_id: 'earn1',
      p_amount: 500,
      p_method: 'mpesa_manual',
      p_reference: 'ABC123',
      p_note: null,
      p_idempotency_key: 'key-123',
      p_paid_at: '2026-08-30T10:00:00Z',
    });
  });

  it('surfaces an idempotency conflict without retrying under a new key', async () => {
    rpc.mockResolvedValue({
      data: null,
      error: { message: 'Idempotency key conflict: key already used for a different payout' },
    });
    const res = await adminRecordProviderPayout({
      earningId: 'earn1',
      amount: 500,
      method: 'cash',
      reference: null,
      note: 'handed over',
      idempotencyKey: 'key-123',
      paidAt: '2026-08-30T10:00:00Z',
    });
    expect(res.ok).toBe(false);
    expect(rpc).toHaveBeenCalledTimes(1);
  });
});

