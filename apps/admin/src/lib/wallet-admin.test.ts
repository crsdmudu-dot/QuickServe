/**
 * wallet-admin.test.ts — admin-only wallet tests.
 *
 * These describe blocks moved verbatim from src/lib/wallet.test.ts when the admin-only
 * exports were split out of the shared @/lib/wallet module into the admin application.
 * Only the import specifier changed; every assertion is unchanged, so coverage is preserved.
 */

import {
  adminGetWallet,
  adminGetWalletTransactions,
  adminAdjustWallet,
} from '@admin/lib/wallet-admin';

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

describe('adminGetWalletTransactions pagination', () => {
  it('calls .range(10, 19) when called with customerId, page=1, pageSize=10', async () => {
    mockRange.mockResolvedValue({ data: [{ id: 'tx1' }], error: null });
    const result = await adminGetWalletTransactions('c3', 1, 10);
    expect(mockRange).toHaveBeenCalledWith(10, 19);
    expect(result).toEqual([{ id: 'tx1' }]);
  });

  it('does NOT call .range when called with only customerId (no-arg stays green)', async () => {
    mockOrder.mockResolvedValue({ data: [{ id: 'tx1' }], error: null });
    const result = await adminGetWalletTransactions('c3');
    expect(result).toEqual([{ id: 'tx1' }]);
    expect(mockRange).not.toHaveBeenCalled();
  });
});

