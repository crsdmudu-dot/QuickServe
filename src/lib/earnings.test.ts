/**
 * earnings.test.ts — Provider Payout V1 client surface.
 *
 * Covers the read helpers, the pure validators, and the three admin RPC wrappers. The legacy
 * mark_payout_paid path is gone and is asserted absent: a payout status with no amount, method,
 * reference, actor or date is not evidence of a payment.
 */

import {
  DEDUCTION_CATEGORIES,
  PAYOUT_METHODS,
  adminGetAllEarnings,
  adminGetProviderEarnings,
  adminRecordProviderDeduction,
  adminRecordProviderPayout,
  adminReverseProviderDeduction,
  evidenceFieldFor,
  getMyEarnings,
  getMyPayoutLedger,
  getProviderEarningsSummary,
  isDeductionReversed,
  newPayoutIdempotencyKey,
  validateDeductionInput,
  validatePayoutInput,
  type ProviderEarningDeduction,
} from '@/lib/earnings';
import * as earnings from '@/lib/earnings';

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

const LEDGER_ROW = {
  earning_id: 'earn1',
  booking_id: 'bk1',
  provider_id: 'prov1',
  provider_entitlement: 1000,
  deductions_total: 200,
  net_provider_payable: 800,
  amount_disbursed: 300,
  outstanding_provider_liability: 500,
  stored_payout_status: 'partially_paid' as const,
  derived_payout_status: 'partially_paid' as const,
};

// ── Legacy path must be gone ───────────────────────────────────────────────

describe('legacy payout path', () => {
  it('no longer exports adminMarkPayoutPaid', () => {
    expect((earnings as Record<string, unknown>).adminMarkPayoutPaid).toBeUndefined();
  });
});

// ── Reads ──────────────────────────────────────────────────────────────────

describe('getMyEarnings', () => {
  it('selects and orders newest first', async () => {
    order.mockResolvedValue({ data: [], error: null });
    await getMyEarnings();
    expect(mockSelect).toHaveBeenCalledWith('*');
    expect(mockOrder).toHaveBeenCalledWith('created_at', { ascending: false });
  });

  it('returns [] on error', async () => {
    order.mockResolvedValue({ data: null, error: { message: 'DB error' } });
    expect(await getMyEarnings()).toEqual([]);
  });
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

describe('getMyPayoutLedger', () => {
  it('reads the ledger view directly', async () => {
    mockSelectResult = { data: [LEDGER_ROW], error: null };
    expect(await getMyPayoutLedger()).toEqual([LEDGER_ROW]);
  });

  it('returns [] on error', async () => {
    mockSelectResult = { data: null, error: { message: 'denied' } };
    expect(await getMyPayoutLedger()).toEqual([]);
  });
});

describe('getProviderEarningsSummary', () => {
  it('sums the ledger view rather than recomputing financial arithmetic', async () => {
    mockSelectResult = { data: [LEDGER_ROW, LEDGER_ROW], error: null };
    expect(await getProviderEarningsSummary()).toEqual({
      entitlement: 2000,
      deductions: 400,
      net_payable: 1600,
      disbursed: 600,
      outstanding: 1000,
    });
  });
});

// ── Types / closed lists ───────────────────────────────────────────────────

describe('closed lists', () => {
  it('payout status supports partially_paid', () => {
    const s: earnings.PayoutStatus = 'partially_paid';
    expect(s).toBe('partially_paid');
  });

  it('exposes exactly the four approved deduction categories', () => {
    expect(DEDUCTION_CATEGORIES.map((c) => c.value)).toEqual([
      'service_issue',
      'damage_or_loss',
      'cancellation_or_no_show',
      'other_authorized',
    ]);
  });

  it('never offers a customer-side or platform category as a provider deduction', () => {
    const values = DEDUCTION_CATEGORIES.map((c) => c.value).join(',');
    for (const forbidden of ['commission', 'platform', 'wallet', 'promo', 'customer']) {
      expect(values).not.toContain(forbidden);
    }
  });

  it('exposes exactly the four payout methods with correct evidence fields', () => {
    expect(PAYOUT_METHODS.map((m) => m.value)).toEqual([
      'mpesa_manual',
      'bank_transfer',
      'cash',
      'other',
    ]);
    expect(evidenceFieldFor('mpesa_manual')).toBe('reference');
    expect(evidenceFieldFor('bank_transfer')).toBe('reference');
    expect(evidenceFieldFor('cash')).toBe('note');
    expect(evidenceFieldFor('other')).toBe('note');
  });
});

// ── Validators ─────────────────────────────────────────────────────────────

describe('validateDeductionInput', () => {
  const base = { entitlement: 1000, deductionsTotal: 0, amountDisbursed: 0 };

  it('rejects non-positive amounts', () => {
    expect(validateDeductionInput({ ...base, amount: 0, category: 'service_issue', reason: 'x' }).ok)
      .toBe(false);
  });

  it('rejects an unknown category', () => {
    expect(validateDeductionInput({ ...base, amount: 10, category: 'commission', reason: 'x' }).ok)
      .toBe(false);
  });

  it('requires a written reason', () => {
    expect(validateDeductionInput({ ...base, amount: 10, category: 'service_issue', reason: '   ' }).ok)
      .toBe(false);
  });

  it('rejects deductions above entitlement', () => {
    expect(validateDeductionInput({ ...base, amount: 1001, category: 'service_issue', reason: 'x' }).ok)
      .toBe(false);
  });

  it('rejects a deduction that would fall below amount already disbursed', () => {
    const res = validateDeductionInput({
      entitlement: 1000,
      deductionsTotal: 0,
      amountDisbursed: 800,
      amount: 300,
      category: 'service_issue',
      reason: 'x',
    });
    expect(res.ok).toBe(false);
  });

  it('accepts a valid deduction', () => {
    expect(validateDeductionInput({ ...base, amount: 100, category: 'damage_or_loss', reason: 'x' }).ok)
      .toBe(true);
  });
});

describe('validatePayoutInput', () => {
  const base = { outstanding: 500, reference: '', note: '' };

  it('rejects non-positive amounts', () => {
    expect(validatePayoutInput({ ...base, amount: 0, method: 'cash', note: 'n' }).ok).toBe(false);
  });

  it('rejects an unknown method', () => {
    expect(validatePayoutInput({ ...base, amount: 10, method: 'crypto', note: 'n' }).ok).toBe(false);
  });

  it('rejects an amount above outstanding', () => {
    expect(validatePayoutInput({ ...base, amount: 501, method: 'cash', note: 'n' }).ok).toBe(false);
  });

  it('blocks recording when nothing is outstanding', () => {
    expect(
      validatePayoutInput({ amount: 10, method: 'cash', reference: '', note: 'n', outstanding: 0 }).ok,
    ).toBe(false);
  });

  it('requires a reference for mpesa_manual and bank_transfer', () => {
    expect(validatePayoutInput({ ...base, amount: 10, method: 'mpesa_manual' }).ok).toBe(false);
    expect(validatePayoutInput({ ...base, amount: 10, method: 'bank_transfer' }).ok).toBe(false);
    expect(
      validatePayoutInput({ ...base, amount: 10, method: 'mpesa_manual', reference: 'ABC123' }).ok,
    ).toBe(true);
  });

  it('requires a note for cash and other', () => {
    expect(validatePayoutInput({ ...base, amount: 10, method: 'cash' }).ok).toBe(false);
    expect(validatePayoutInput({ ...base, amount: 10, method: 'other' }).ok).toBe(false);
    expect(validatePayoutInput({ ...base, amount: 10, method: 'cash', note: 'handed over' }).ok)
      .toBe(true);
  });
});

// ── Reversal helper ────────────────────────────────────────────────────────

describe('isDeductionReversed', () => {
  const original: ProviderEarningDeduction = {
    id: 'd1',
    earning_id: 'earn1',
    amount: 100,
    category: 'service_issue',
    reason: 'r',
    reversal_of: null,
    created_by: 'a1',
    created_at: '2026-08-01T00:00:00Z',
  };
  const reversal: ProviderEarningDeduction = { ...original, id: 'd2', reversal_of: 'd1' };

  it('is false with no reversal row', () => {
    expect(isDeductionReversed(original, [original])).toBe(false);
  });

  it('is true once a reversal row points at it', () => {
    expect(isDeductionReversed(original, [original, reversal])).toBe(true);
  });
});

// ── Idempotency ────────────────────────────────────────────────────────────

describe('payout idempotency key', () => {
  it('produces a distinct key per call, so a new payout is a new financial event', () => {
    expect(newPayoutIdempotencyKey()).not.toBe(newPayoutIdempotencyKey());
  });
});

// ── Admin RPC wrappers ─────────────────────────────────────────────────────

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
