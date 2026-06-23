import {
  submitReview,
  getMyReviewForBooking,
  getProviderReviews,
  setReviewHidden,
} from '@/lib/reviews';

// ── Mock Supabase ──────────────────────────────────────────────────────────

const getUser = jest.fn();
const insert = jest.fn();
const select = jest.fn();
const eq = jest.fn();
const maybeSingle = jest.fn();
const order = jest.fn();
const update = jest.fn();
const updateEq = jest.fn();

// Note: variables used inside jest.mock() factory must be prefixed with "mock" (Jest rule).
const mockGetUser = getUser;
const mockInsert = insert;
const mockSelect = select;
const mockEq = eq;
const mockMaybeSingle = maybeSingle;
const mockOrder = order;
const mockUpdate = update;
const mockUpdateEq = updateEq;

jest.mock('@/lib/supabase', () => ({
  supabase: {
    auth: { getUser: (...a: unknown[]) => mockGetUser(...a) },
    from: () => ({
      insert: (...a: unknown[]) => mockInsert(...a),
      select: (...a: unknown[]) => {
        mockSelect(...a);
        return {
          eq: (...b: unknown[]) => {
            mockEq(...b);
            return {
              maybeSingle: (...c: unknown[]) => mockMaybeSingle(...c),
              order: (...c: unknown[]) => mockOrder(...c),
            };
          },
        };
      },
      update: (...a: unknown[]) => mockUpdate(...a),
    }),
  },
}));

beforeEach(() => {
  jest.clearAllMocks();
});

// ── Tests ──────────────────────────────────────────────────────────────────

describe('submitReview', () => {
  it('submitReview inserts with customer_id from auth', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'u1' } } });
    insert.mockResolvedValue({ error: null });
    const res = await submitReview({ bookingId: 'bk1', providerId: 'p1', rating: 5, comment: 'Great' });
    expect(res).toEqual({ ok: true });
    expect(insert).toHaveBeenCalledWith({
      booking_id: 'bk1', customer_id: 'u1', provider_id: 'p1', rating: 5, comment: 'Great',
    });
  });

  it('submitReview maps the unique-violation to a friendly message', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'u1' } } });
    insert.mockResolvedValue({ error: { code: '23505', message: 'duplicate' } });
    expect(await submitReview({ bookingId: 'bk1', providerId: 'p1', rating: 4 })).toEqual({
      ok: false, error: "You've already reviewed this booking.",
    });
  });
});

describe('getMyReviewForBooking', () => {
  it('getMyReviewForBooking returns the row or null', async () => {
    maybeSingle.mockResolvedValue({ data: { id: 'r1', rating: 5 }, error: null });
    expect(await getMyReviewForBooking('bk1')).toEqual({ id: 'r1', rating: 5 });
    maybeSingle.mockResolvedValue({ data: null, error: null });
    expect(await getMyReviewForBooking('bk1')).toBeNull();
  });
});

describe('getProviderReviews', () => {
  it('getProviderReviews returns rows newest-first', async () => {
    order.mockResolvedValue({ data: [{ id: 'r1' }], error: null });
    expect(await getProviderReviews('p1')).toEqual([{ id: 'r1' }]);
    expect(eq).toHaveBeenCalledWith('provider_id', 'p1');
  });
});

describe('setReviewHidden', () => {
  it('setReviewHidden updates is_hidden', async () => {
    update.mockReturnValue({ eq: (...a: unknown[]) => mockUpdateEq(...a) });
    updateEq.mockResolvedValue({ error: null });
    expect(await setReviewHidden('r1', true)).toEqual({ ok: true });
    expect(update).toHaveBeenCalledWith({ is_hidden: true });
  });
});
