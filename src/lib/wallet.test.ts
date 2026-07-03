import {
  getMyWallet,
  getMyWalletTransactions,
  applyWalletToPayment,
  adminGetWallet,
  adminGetWalletTransactions,
  adminAdjustWallet,
  amountDue,
  WALLET_TXN_TYPES,
} from '@/lib/wallet';

// ── Mock fns (prefixed with "mock" — Jest factory rule) ───────────────────

const mockMaybeSingle = jest.fn();
const mockSelect = jest.fn();
const mockEq = jest.fn();
const mockOrder = jest.fn();
const mockRpc = jest.fn();

jest.mock('@/lib/supabase', () => ({
  supabase: {
    rpc: (...a: unknown[]) => mockRpc(...a),
    from: (_table: string) => ({
      select: (...a: unknown[]) => {
        mockSelect(...a);
        return {
          maybeSingle: (...b: unknown[]) => mockMaybeSingle(...b),
          order: (...b: unknown[]) => mockOrder(...b),
          eq: (...b: unknown[]) => {
            mockEq(...b);
            return {
              maybeSingle: (...c: unknown[]) => mockMaybeSingle(...c),
              order: (...c: unknown[]) => mockOrder(...c),
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

describe('adminGetWallet', () => {
  it('uses .eq("customer_id", ...) and returns the wallet row', async () => {
    const row = { id: 'w2', customer_id: 'c2', balance: 1000, currency: 'KES', created_at: 't', updated_at: 't' };
    mockMaybeSingle.mockResolvedValue({ data: row, error: null });

    const result = await adminGetWallet('c2');
    expect(result).toEqual(row);
    expect(mockEq).toHaveBeenCalledWith('customer_id', 'c2');
  });

  it('returns default wallet when no row exists', async () => {
    mockMaybeSingle.mockResolvedValue({ data: null, error: null });

    const result = await adminGetWallet('c2');
    expect(result.balance).toBe(0);
    expect(result.id).toBe('');
  });
});

// ── adminGetWalletTransactions ─────────────────────────────────────────────

describe('adminGetWalletTransactions', () => {
  it('uses .eq("customer_id", ...) and returns rows', async () => {
    const rows = [{ id: 'tx3' }];
    mockOrder.mockResolvedValue({ data: rows, error: null });

    const result = await adminGetWalletTransactions('c3');
    expect(result).toEqual(rows);
    expect(mockEq).toHaveBeenCalledWith('customer_id', 'c3');
    expect(mockOrder).toHaveBeenCalledWith('created_at', { ascending: false });
  });

  it('returns [] on error', async () => {
    mockOrder.mockResolvedValue({ data: null, error: { message: 'DB error' } });

    const result = await adminGetWalletTransactions('c3');
    expect(result).toEqual([]);
  });
});

// ── adminAdjustWallet ──────────────────────────────────────────────────────

describe('adminAdjustWallet', () => {
  it('calls rpc with signed amount (positive credit) and returns {ok:true}', async () => {
    mockRpc.mockResolvedValue({ data: null, error: null });

    const result = await adminAdjustWallet('c4', 'admin_credit', 500, 'Promo top-up');
    expect(result).toEqual({ ok: true });
    expect(mockRpc).toHaveBeenCalledWith('admin_wallet_adjust', {
      p_customer_id: 'c4',
      p_type: 'admin_credit',
      p_amount: 500,
      p_note: 'Promo top-up',
    });
  });

  it('calls rpc with signed amount (negative debit) and returns {ok:true}', async () => {
    mockRpc.mockResolvedValue({ data: null, error: null });

    const result = await adminAdjustWallet('c4', 'admin_debit', -200, 'Correction');
    expect(result).toEqual({ ok: true });
    expect(mockRpc).toHaveBeenCalledWith('admin_wallet_adjust', {
      p_customer_id: 'c4',
      p_type: 'admin_debit',
      p_amount: -200,
      p_note: 'Correction',
    });
  });

  it('returns {ok:false} with message on rpc error', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'Admin only' } });

    const result = await adminAdjustWallet('c5', 'promo_credit', 100, 'Test');
    expect(result).toEqual({
      ok: false,
      error: 'Could not adjust wallet. Please try again.',
    });
  });
});

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
});
