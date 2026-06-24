import {
  getMyEarnings,
  getProviderEarningsSummary,
  adminGetProviderEarnings,
  adminMarkPayoutPaid,
} from '@/lib/earnings';

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

beforeEach(() => {
  jest.clearAllMocks();
});

// ── Sample earning fixture ─────────────────────────────────────────────────

const mockEarningPending = {
  id: 'earn1',
  provider_id: 'prov1',
  booking_id: 'bk1',
  amount: 400,
  payout_status: 'pending' as const,
  created_at: '2026-06-24T09:00:00Z',
};

const mockEarningPaid = {
  id: 'earn2',
  provider_id: 'prov1',
  booking_id: 'bk2',
  amount: 300,
  payout_status: 'paid' as const,
  created_at: '2026-06-23T09:00:00Z',
};

// ── getMyEarnings ──────────────────────────────────────────────────────────

describe('getMyEarnings', () => {
  it('returns list of earnings on success', async () => {
    order.mockResolvedValue({ data: [mockEarningPending, mockEarningPaid], error: null });
    const res = await getMyEarnings();
    expect(res).toEqual([mockEarningPending, mockEarningPaid]);
    expect(mockSelect).toHaveBeenCalledWith('*');
    expect(mockOrder).toHaveBeenCalledWith('created_at', { ascending: false });
  });

  it('returns [] on error', async () => {
    order.mockResolvedValue({ data: null, error: { message: 'DB error' } });
    const res = await getMyEarnings();
    expect(res).toEqual([]);
  });
});

// ── getProviderEarningsSummary ─────────────────────────────────────────────

describe('getProviderEarningsSummary', () => {
  it('returns correct pending/paid totals for mixed rows', async () => {
    order.mockResolvedValue({
      data: [mockEarningPending, mockEarningPaid],
      error: null,
    });
    const res = await getProviderEarningsSummary();
    expect(res).toEqual({ pending: 400, paid: 300 });
  });

  it('returns { pending: 0, paid: 0 } for empty list', async () => {
    order.mockResolvedValue({ data: [], error: null });
    const res = await getProviderEarningsSummary();
    expect(res).toEqual({ pending: 0, paid: 0 });
  });
});

// ── adminGetProviderEarnings ───────────────────────────────────────────────

describe('adminGetProviderEarnings', () => {
  it('returns rows and applies provider_id filter on success', async () => {
    order.mockResolvedValue({ data: [mockEarningPending], error: null });
    const res = await adminGetProviderEarnings('prov1');
    expect(res).toEqual([mockEarningPending]);
    expect(mockEq).toHaveBeenCalledWith('provider_id', 'prov1');
    expect(mockOrder).toHaveBeenCalledWith('created_at', { ascending: false });
  });

  it('returns [] on error', async () => {
    order.mockResolvedValue({ data: null, error: { message: 'DB error' } });
    const res = await adminGetProviderEarnings('prov1');
    expect(res).toEqual([]);
  });
});

// ── adminMarkPayoutPaid ────────────────────────────────────────────────────

describe('adminMarkPayoutPaid', () => {
  it('calls mark_payout_paid RPC with correct args on success', async () => {
    rpc.mockResolvedValue({ error: null });
    const res = await adminMarkPayoutPaid('earn1');
    expect(res).toEqual({ ok: true });
    expect(rpc).toHaveBeenCalledWith('mark_payout_paid', { p_earning_id: 'earn1' });
  });

  it('returns friendly error when RPC fails', async () => {
    rpc.mockResolvedValue({ error: { message: 'Permission denied' } });
    const res = await adminMarkPayoutPaid('earn1');
    expect(res).toEqual({
      ok: false,
      error: 'Could not update payout. Please try again.',
    });
  });
});
