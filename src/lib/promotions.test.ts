import {
  redeemPromo,
  getMyPromoRedemptions,
  adminGetPromoCodes,
  adminCreatePromoCode,
  adminUpdatePromoCode,
  adminGetPromoRedemptions,
} from '@/lib/promotions';

// ── Mock fns (prefixed with "mock" — Jest factory rule) ───────────────────

const mockRpc = jest.fn();
const mockSelect = jest.fn();
const mockOrder = jest.fn();
const mockEq = jest.fn();
const mockInsert = jest.fn();
const mockUpdate = jest.fn();
const mockUpdateEq = jest.fn();

jest.mock('@/lib/supabase', () => ({
  supabase: {
    rpc: (...a: unknown[]) => mockRpc(...a),
    from: (_table: string) => ({
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
      insert: (...a: unknown[]) => mockInsert(...a),
      update: (...a: unknown[]) => {
        mockUpdate(...a);
        return {
          eq: (...b: unknown[]) => {
            mockUpdateEq(...b);
            return mockUpdateEq.mock.results.slice(-1)[0]?.value;
          },
        };
      },
    }),
  },
}));

beforeEach(() => {
  jest.clearAllMocks();
});

// ── redeemPromo ────────────────────────────────────────────────────────────

describe('redeemPromo', () => {
  it('calls rpc with correct name and args, returns {ok:true, discount}', async () => {
    mockRpc.mockResolvedValue({ data: 200, error: null });

    const result = await redeemPromo('pay-1', 'SAVE20');

    expect(result).toEqual({ ok: true, discount: 200 });
    expect(mockRpc).toHaveBeenCalledWith('redeem_promo', {
      p_payment_id: 'pay-1',
      p_code: 'SAVE20',
    });
  });

  it('surfaces DB raise message as error when rpc fails', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'Promo already applied' } });

    const result = await redeemPromo('pay-1', 'SAVE20');

    expect(result).toEqual({ ok: false, error: 'Promo already applied' });
  });

  it('falls back to generic message when error has no message', async () => {
    mockRpc.mockResolvedValue({ data: null, error: {} });

    const result = await redeemPromo('pay-1', 'SAVE20');

    expect(result).toEqual({ ok: false, error: 'Could not apply promo code.' });
  });
});

// ── getMyPromoRedemptions ──────────────────────────────────────────────────

describe('getMyPromoRedemptions', () => {
  it('returns rows newest-first on success', async () => {
    const rows = [{ id: 'r1', promo_code_id: 'pc1' }, { id: 'r2', promo_code_id: 'pc1' }];
    mockOrder.mockResolvedValue({ data: rows, error: null });

    const result = await getMyPromoRedemptions();

    expect(result).toEqual(rows);
    expect(mockSelect).toHaveBeenCalledWith('*');
    expect(mockOrder).toHaveBeenCalledWith('created_at', { ascending: false });
  });

  it('returns [] on error', async () => {
    mockOrder.mockResolvedValue({ data: null, error: { message: 'DB error' } });

    const result = await getMyPromoRedemptions();

    expect(result).toEqual([]);
  });
});

// ── adminGetPromoCodes ─────────────────────────────────────────────────────

describe('adminGetPromoCodes', () => {
  it('returns all rows newest-first on success', async () => {
    const rows = [{ id: 'pc1', code: 'SUMMER10' }, { id: 'pc2', code: 'WINTER20' }];
    mockOrder.mockResolvedValue({ data: rows, error: null });

    const result = await adminGetPromoCodes();

    expect(result).toEqual(rows);
    expect(mockSelect).toHaveBeenCalledWith('*');
    expect(mockOrder).toHaveBeenCalledWith('created_at', { ascending: false });
  });

  it('returns [] on error', async () => {
    mockOrder.mockResolvedValue({ data: null, error: { message: 'DB error' } });

    const result = await adminGetPromoCodes();

    expect(result).toEqual([]);
  });
});

// ── adminCreatePromoCode ───────────────────────────────────────────────────

describe('adminCreatePromoCode', () => {
  it('inserts with code UPPERCASED and returns {ok:true}', async () => {
    mockInsert.mockResolvedValue({ error: null });

    const result = await adminCreatePromoCode({
      code: 'save10',
      discount_type: 'fixed',
      discount_value: 100,
    });

    expect(result).toEqual({ ok: true });
    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'SAVE10' }),
    );
  });

  it('trims and uppercases code with surrounding spaces', async () => {
    mockInsert.mockResolvedValue({ error: null });

    await adminCreatePromoCode({
      code: '  promo50  ',
      discount_type: 'percentage',
      discount_value: 50,
    });

    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'PROMO50' }),
    );
  });

  it('returns {ok:false, error} on insert error', async () => {
    mockInsert.mockResolvedValue({ error: { message: 'unique violation' } });

    const result = await adminCreatePromoCode({
      code: 'dup',
      discount_type: 'fixed',
      discount_value: 50,
    });

    expect(result).toEqual({ ok: false, error: 'Could not create promo code.' });
  });
});

// ── adminUpdatePromoCode ───────────────────────────────────────────────────

describe('adminUpdatePromoCode', () => {
  it('calls update(patch).eq("id", id) and returns {ok:true}', async () => {
    mockUpdateEq.mockResolvedValue({ error: null });

    const result = await adminUpdatePromoCode('pc-1', { is_active: false });

    expect(result).toEqual({ ok: true });
    expect(mockUpdate).toHaveBeenCalledWith({ is_active: false });
    expect(mockUpdateEq).toHaveBeenCalledWith('id', 'pc-1');
  });

  it('returns {ok:false, error} on update error', async () => {
    mockUpdateEq.mockResolvedValue({ error: { message: 'not found' } });

    const result = await adminUpdatePromoCode('pc-1', { is_active: true });

    expect(result).toEqual({ ok: false, error: 'Could not update promo code.' });
  });
});

// ── adminGetPromoRedemptions ───────────────────────────────────────────────

describe('adminGetPromoRedemptions', () => {
  it('filters by promo_code_id when promoCodeId is provided', async () => {
    const rows = [{ id: 'r1', promo_code_id: 'pc-1' }];
    mockOrder.mockResolvedValue({ data: rows, error: null });

    const result = await adminGetPromoRedemptions('pc-1');

    expect(result).toEqual(rows);
    expect(mockEq).toHaveBeenCalledWith('promo_code_id', 'pc-1');
    expect(mockOrder).toHaveBeenCalledWith('created_at', { ascending: false });
  });

  it('does NOT call .eq when promoCodeId is omitted', async () => {
    const rows = [{ id: 'r1' }, { id: 'r2' }];
    mockOrder.mockResolvedValue({ data: rows, error: null });

    const result = await adminGetPromoRedemptions();

    expect(result).toEqual(rows);
    expect(mockEq).not.toHaveBeenCalled();
    expect(mockOrder).toHaveBeenCalledWith('created_at', { ascending: false });
  });

  it('returns [] on error', async () => {
    mockOrder.mockResolvedValue({ data: null, error: { message: 'DB error' } });

    const result = await adminGetPromoRedemptions();

    expect(result).toEqual([]);
  });
});
