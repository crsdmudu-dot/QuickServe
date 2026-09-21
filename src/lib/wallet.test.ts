import {
  getMyWallet,
  getMyWalletTransactions,
  applyWalletToPayment,
  amountDue,
  WALLET_TXN_TYPES,
} from '@/lib/wallet';

// ── Mock fns (prefixed with "mock" — Jest factory rule) ───────────────────

const mockMaybeSingle = jest.fn();
const mockSelect = jest.fn();
const mockEq = jest.fn();
const mockOrder = jest.fn();
const mockRange = jest.fn();
const mockRpc = jest.fn();

jest.mock('@/lib/supabase', () => ({
  supabase: {
    rpc: (...a: unknown[]) => mockRpc(...a),
    from: (_table: string) => ({
      select: (...a: unknown[]) => {
        mockSelect(...a);
        return {
          maybeSingle: (...b: unknown[]) => mockMaybeSingle(...b),
          order: (...b: unknown[]) => {
            const promise = mockOrder(...b) as Promise<unknown>;
            (promise as unknown as { range: (...c: unknown[]) => unknown }).range =
              (...c: unknown[]) => mockRange(...c);
            return promise;
          },
          eq: (...b: unknown[]) => {
            mockEq(...b);
            return {
              maybeSingle: (...c: unknown[]) => mockMaybeSingle(...c),
              order: (...c: unknown[]) => {
                const promise = mockOrder(...c) as Promise<unknown>;
                (promise as unknown as { range: (...d: unknown[]) => unknown }).range =
                  (...d: unknown[]) => mockRange(...d);
                return promise;
              },
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

// ── WALLET_TXN_TYPES ───────────────────────────────────────────────────────

describe('WALLET_TXN_TYPES', () => {
  it('has exactly 8 entries', () => {
    expect(Object.keys(WALLET_TXN_TYPES)).toHaveLength(8);
  });

  it('payment_applied and admin_debit are direction:debit', () => {
    expect(WALLET_TXN_TYPES.payment_applied.direction).toBe('debit');
    expect(WALLET_TXN_TYPES.admin_debit.direction).toBe('debit');
  });

  it('all other types are direction:credit', () => {
    const creditTypes = ['admin_credit', 'refund_credit', 'promo_credit', 'referral_credit', 'gift_credit', 'adjustment'] as const;
    for (const t of creditTypes) {
      expect(WALLET_TXN_TYPES[t].direction).toBe('credit');
    }
  });
});

// ── getMyWallet ────────────────────────────────────────────────────────────

describe('getMyWallet', () => {
  it('returns the wallet row when it exists', async () => {
    const row = { id: 'w1', customer_id: 'c1', balance: 500, currency: 'KES', created_at: 't', updated_at: 't' };
    mockMaybeSingle.mockResolvedValue({ data: row, error: null });

    const result = await getMyWallet();
    expect(result).toEqual(row);
    expect(mockSelect).toHaveBeenCalledWith('*');
  });

  it('returns default wallet with balance:0 when no row exists', async () => {
    mockMaybeSingle.mockResolvedValue({ data: null, error: null });

    const result = await getMyWallet();
    expect(result).toEqual({
      id: '',
      customer_id: '',
      balance: 0,
      currency: 'KES',
      created_at: '',
      updated_at: '',
    });
  });

  it('returns default wallet on error', async () => {
    mockMaybeSingle.mockResolvedValue({ data: null, error: { message: 'DB error' } });

    const result = await getMyWallet();
    expect(result.balance).toBe(0);
    expect(result.id).toBe('');
  });
});

// ── getMyWalletTransactions ────────────────────────────────────────────────

describe('getMyWalletTransactions', () => {
  it('returns rows newest-first on success', async () => {
    const rows = [{ id: 'tx1' }, { id: 'tx2' }];
    mockOrder.mockResolvedValue({ data: rows, error: null });

    const result = await getMyWalletTransactions();
    expect(result).toEqual(rows);
    expect(mockOrder).toHaveBeenCalledWith('created_at', { ascending: false });
  });

  it('returns [] on error', async () => {
    mockOrder.mockResolvedValue({ data: null, error: { message: 'DB error' } });

    const result = await getMyWalletTransactions();
    expect(result).toEqual([]);
  });
});

// ── applyWalletToPayment ───────────────────────────────────────────────────

describe('applyWalletToPayment', () => {
  it('calls rpc with correct name and args, returns {ok:true}', async () => {
    mockRpc.mockResolvedValue({ data: null, error: null });

    const result = await applyWalletToPayment('pay-1', 200);
    expect(result).toEqual({ ok: true });
    expect(mockRpc).toHaveBeenCalledWith('apply_wallet_to_payment', {
      p_payment_id: 'pay-1',
      p_amount: 200,
    });
  });

  it('returns {ok:false} with message on rpc error', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'Insufficient balance' } });

    const result = await applyWalletToPayment('pay-1', 999);
    expect(result).toEqual({
      ok: false,
      error: 'Could not apply wallet credit. Please try again.',
    });
  });
});

// ── adminGetWallet ─────────────────────────────────────────────────────────

// ── adminGetWalletTransactions ─────────────────────────────────────────────

// ── adminAdjustWallet ──────────────────────────────────────────────────────

// ── amountDue ──────────────────────────────────────────────────────────────

describe('amountDue', () => {
  it('returns amount minus wallet_applied', () => {
    expect(amountDue({ amount: 1000, wallet_applied: 300 })).toBe(700);
  });

  it('returns full amount when wallet_applied is 0', () => {
    expect(amountDue({ amount: 500, wallet_applied: 0 })).toBe(500);
  });

  it('returns full amount when wallet_applied is undefined', () => {
    expect(amountDue({ amount: 750 })).toBe(750);
  });

  it('subtracts both wallet_applied and promo_discount', () => {
    expect(amountDue({ amount: 1000, wallet_applied: 300, promo_discount: 200 })).toBe(500);
  });

  it('defaults promo_discount to 0 when absent', () => {
    expect(amountDue({ amount: 1000, wallet_applied: 200 })).toBe(800);
  });

  it('defaults wallet_applied to 0 when absent, still applies promo_discount', () => {
    expect(amountDue({ amount: 1000, promo_discount: 150 })).toBe(850);
  });

  it('defaults both to 0 when only amount is provided', () => {
    expect(amountDue({ amount: 600 })).toBe(600);
  });

  it('floors at 0 when discount exceeds amount (never negative)', () => {
    expect(amountDue({ amount: 100, wallet_applied: 80, promo_discount: 50 })).toBe(0);
  });

  it('floors at 0 when promo_discount alone exceeds amount', () => {
    expect(amountDue({ amount: 100, promo_discount: 200 })).toBe(0);
  });
});

// ── adminGetWalletTransactions pagination ──────────────────────────────────
