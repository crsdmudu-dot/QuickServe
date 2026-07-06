import {
  submitReview,
  getMyReviewForBooking,
  getProviderReviews,
  adminGetAllReviews,
  setReviewHidden,
  getProviderRatingBreakdown,
  getReviewPrivateFeedback,
  editReview,
  canEditReview,
  REVIEW_TAGS,
} from '@/lib/reviews';

// ── Mock fns (prefixed with "mock" — Jest factory rule) ───────────────────

// reviews table helpers
const mockGetUser = jest.fn();
const mockReviewInsertSingle = jest.fn(); // .insert(...).select('id').single()
const mockSelect = jest.fn();
const mockEq = jest.fn();
const mockMaybeSingle = jest.fn();
const mockOrder = jest.fn();
const mockRange = jest.fn();
const mockUpdate = jest.fn();
const mockUpdateEq = jest.fn();

// review_private_feedback helpers
const mockPrivateInsert = jest.fn(); // plain insert → { error }
const mockPrivateMaybeSingle = jest.fn(); // .select('*').eq(...).maybeSingle()
const mockPrivateEq = jest.fn();

// rpc
const mockRpc = jest.fn();

jest.mock('@/lib/supabase', () => ({
  supabase: {
    auth: { getUser: (...a: unknown[]) => mockGetUser(...a) },
    rpc: (...a: unknown[]) => mockRpc(...a),
    from: (table: string) => {
      if (table === 'review_private_feedback') {
        return {
          insert: (...a: unknown[]) => mockPrivateInsert(...a),
          select: () => ({
            eq: (...a: unknown[]) => {
              mockPrivateEq(...a);
              return { maybeSingle: (...b: unknown[]) => mockPrivateMaybeSingle(...b) };
            },
          }),
        };
      }
      // Default: reviews table
      return {
        insert: (...a: unknown[]) => {
          mockReviewInsertSingle(...a);
          return {
            select: () => ({ single: () => mockReviewInsertSingle.mock.results.slice(-1)[0]?.value }),
          };
        },
        select: (...a: unknown[]) => {
          mockSelect(...a);
          return {
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
                order: (...c: unknown[]) => mockOrder(...c),
              };
            },
          };
        },
        update: (...a: unknown[]) => {
          mockUpdate(...a);
          return { eq: (...b: unknown[]) => mockUpdateEq(...b) };
        },
      };
    },
  },
}));

beforeEach(() => {
  jest.clearAllMocks();
});

// ── Helper to set up a successful review insert ────────────────────────────

function setupReviewInsertOk(reviewId = 'r-new') {
  mockReviewInsertSingle.mockResolvedValue({ data: { id: reviewId }, error: null });
}

function setupReviewInsertError(code: string, message = 'err') {
  mockReviewInsertSingle.mockResolvedValue({ data: null, error: { code, message } });
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe('REVIEW_TAGS', () => {
  it('has exactly 9 entries (5 positive, 4 negative)', () => {
    expect(REVIEW_TAGS).toHaveLength(9);
    expect(REVIEW_TAGS.filter((t) => t.sentiment === 'positive')).toHaveLength(5);
    expect(REVIEW_TAGS.filter((t) => t.sentiment === 'negative')).toHaveLength(4);
  });
});

describe('submitReview', () => {
  it('inserts with full payload (nulls for omitted category fields, [] for tags)', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } });
    setupReviewInsertOk('r1');

    const res = await submitReview({ bookingId: 'bk1', providerId: 'p1', rating: 5, comment: 'Great' });

    expect(res).toEqual({ ok: true });
    expect(mockReviewInsertSingle).toHaveBeenCalledWith({
      booking_id: 'bk1',
      customer_id: 'u1',
      provider_id: 'p1',
      rating: 5,
      comment: 'Great',
      quality_rating: null,
      punctuality_rating: null,
      communication_rating: null,
      professionalism_rating: null,
      value_rating: null,
      would_recommend: null,
      tags: [],
    });
    // No private feedback insert when privateFeedback absent
    expect(mockPrivateInsert).not.toHaveBeenCalled();
  });

  it('does NOT call private insert when privateFeedback is absent', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } });
    setupReviewInsertOk('r1');
    await submitReview({ bookingId: 'bk1', providerId: 'p1', rating: 4 });
    expect(mockPrivateInsert).not.toHaveBeenCalled();
  });

  it('calls private insert with correct payload when privateFeedback provided', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } });
    setupReviewInsertOk('r-new');
    mockPrivateInsert.mockResolvedValue({ error: null });

    const res = await submitReview({
      bookingId: 'bk1',
      providerId: 'p1',
      rating: 5,
      privateFeedback: 'x',
    });

    expect(res).toEqual({ ok: true });
    expect(mockPrivateInsert).toHaveBeenCalledWith({
      review_id: 'r-new',
      customer_id: 'u1',
      provider_id: 'p1',
      feedback: 'x',
    });
  });

  it('carries category ratings, tags, and wouldRecommend into insert payload', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u2' } } });
    setupReviewInsertOk('r2');

    await submitReview({
      bookingId: 'bk2',
      providerId: 'p2',
      rating: 4,
      qualityRating: 5,
      punctualityRating: 4,
      communicationRating: 3,
      professionalismRating: 5,
      valueRating: 4,
      wouldRecommend: true,
      tags: ['on_time', 'friendly'],
    });

    expect(mockReviewInsertSingle).toHaveBeenCalledWith(
      expect.objectContaining({
        quality_rating: 5,
        punctuality_rating: 4,
        communication_rating: 3,
        professionalism_rating: 5,
        value_rating: 4,
        would_recommend: true,
        tags: ['on_time', 'friendly'],
      }),
    );
  });

  it('maps 23505 unique violation to friendly message', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } });
    setupReviewInsertError('23505', 'duplicate');

    expect(await submitReview({ bookingId: 'bk1', providerId: 'p1', rating: 4 })).toEqual({
      ok: false,
      error: "You've already reviewed this booking.",
    });
  });

  it('maps other DB errors to generic message', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } });
    setupReviewInsertError('42501', 'permission denied');

    expect(await submitReview({ bookingId: 'bk1', providerId: 'p1', rating: 3 })).toEqual({
      ok: false,
      error: 'Could not submit review. Please try again.',
    });
  });

  it('returns not-signed-in error when no user', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });
    expect(await submitReview({ bookingId: 'bk1', providerId: 'p1', rating: 5 })).toEqual({
      ok: false,
      error: 'You must be signed in.',
    });
  });
});

describe('getMyReviewForBooking', () => {
  it('returns the row or null', async () => {
    mockMaybeSingle.mockResolvedValue({ data: { id: 'r1', rating: 5 }, error: null });
    expect(await getMyReviewForBooking('bk1')).toEqual({ id: 'r1', rating: 5 });
    mockMaybeSingle.mockResolvedValue({ data: null, error: null });
    expect(await getMyReviewForBooking('bk1')).toBeNull();
  });
});

describe('getProviderReviews', () => {
  it('returns rows newest-first', async () => {
    mockOrder.mockResolvedValue({ data: [{ id: 'r1' }], error: null });
    expect(await getProviderReviews('p1')).toEqual([{ id: 'r1' }]);
    expect(mockEq).toHaveBeenCalledWith('provider_id', 'p1');
  });
});

describe('setReviewHidden', () => {
  it('updates is_hidden', async () => {
    mockUpdateEq.mockResolvedValue({ error: null });
    expect(await setReviewHidden('r1', true)).toEqual({ ok: true });
    expect(mockUpdate).toHaveBeenCalledWith({ is_hidden: true });
  });
});

describe('adminGetAllReviews', () => {
  it('returns all rows newest-first on success', async () => {
    mockOrder.mockResolvedValue({ data: [{ id: 'r1' }], error: null });
    const res = await adminGetAllReviews();
    expect(res).toEqual([{ id: 'r1' }]);
    expect(mockSelect).toHaveBeenCalledWith('*');
    expect(mockOrder).toHaveBeenCalledWith('created_at', { ascending: false });
  });

  it('returns [] on error', async () => {
    mockOrder.mockResolvedValue({ data: null, error: { message: 'DB error' } });
    const res = await adminGetAllReviews();
    expect(res).toEqual([]);
  });
});

describe('getProviderRatingBreakdown', () => {
  it('maps data[0] from the RPC', async () => {
    const breakdown = {
      overall_avg: 4.5,
      review_count: 10,
      recommend_pct: 80,
      quality_avg: 4.2,
      punctuality_avg: 4.8,
      communication_avg: 4.0,
      professionalism_avg: 4.6,
      value_avg: 4.1,
      top_tags: ['on_time', 'friendly'],
    };
    mockRpc.mockResolvedValue({ data: [breakdown], error: null });
    expect(await getProviderRatingBreakdown('p1')).toEqual(breakdown);
    expect(mockRpc).toHaveBeenCalledWith('get_provider_rating_breakdown', { p_provider_id: 'p1' });
  });

  it('returns EMPTY_BREAKDOWN when data is empty array', async () => {
    mockRpc.mockResolvedValue({ data: [], error: null });
    expect(await getProviderRatingBreakdown('p1')).toEqual({
      overall_avg: null,
      review_count: 0,
      recommend_pct: null,
      quality_avg: null,
      punctuality_avg: null,
      communication_avg: null,
      professionalism_avg: null,
      value_avg: null,
      top_tags: [],
    });
  });

  it('returns EMPTY_BREAKDOWN on error', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'rpc error' } });
    expect(await getProviderRatingBreakdown('p1')).toEqual({
      overall_avg: null,
      review_count: 0,
      recommend_pct: null,
      quality_avg: null,
      punctuality_avg: null,
      communication_avg: null,
      professionalism_avg: null,
      value_avg: null,
      top_tags: [],
    });
  });
});

describe('getReviewPrivateFeedback', () => {
  it('returns the row when found', async () => {
    mockPrivateMaybeSingle.mockResolvedValue({ data: { feedback: 'Private note' } });
    const res = await getReviewPrivateFeedback('r1');
    expect(res).toEqual({ feedback: 'Private note' });
    expect(mockPrivateEq).toHaveBeenCalledWith('review_id', 'r1');
  });

  it('returns null when not found (RLS blocks provider)', async () => {
    mockPrivateMaybeSingle.mockResolvedValue({ data: null });
    expect(await getReviewPrivateFeedback('r1')).toBeNull();
  });
});

// ── editReview (Slice 34) ──────────────────────────────────────────────────

describe('editReview', () => {
  it('calls edit_review rpc with correct p_ params', async () => {
    mockRpc.mockResolvedValue({ data: null, error: null });

    const res = await editReview({
      reviewId: 'r-edit-1',
      rating: 4,
      comment: 'Updated comment',
      qualityRating: 5,
      punctualityRating: 4,
      communicationRating: 3,
      professionalismRating: 5,
      valueRating: 4,
      wouldRecommend: true,
      tags: ['on_time', 'friendly'],
    });

    expect(res).toEqual({ ok: true });
    expect(mockRpc).toHaveBeenCalledWith('edit_review', {
      p_review_id:       'r-edit-1',
      p_comment:         'Updated comment',
      p_rating:          4,
      p_quality:         5,
      p_punctuality:     4,
      p_communication:   3,
      p_professionalism: 5,
      p_value:           4,
      p_would_recommend: true,
      p_tags:            ['on_time', 'friendly'],
    });
  });

  it('passes nulls for omitted optional fields', async () => {
    mockRpc.mockResolvedValue({ data: null, error: null });

    await editReview({ reviewId: 'r-edit-2', rating: 3 });

    expect(mockRpc).toHaveBeenCalledWith('edit_review', {
      p_review_id:       'r-edit-2',
      p_comment:         null,
      p_rating:          3,
      p_quality:         null,
      p_punctuality:     null,
      p_communication:   null,
      p_professionalism: null,
      p_value:           null,
      p_would_recommend: null,
      p_tags:            [],
    });
  });

  it('returns { ok: false, error } on rpc error (edit window closed or not owner)', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'edit window closed or not owner' } });

    const res = await editReview({ reviewId: 'r-old', rating: 5 });

    expect(res).toEqual({ ok: false, error: 'Could not update review.' });
  });

  it('returns { ok: false, error } on generic rpc error', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'DB error' } });

    const res = await editReview({ reviewId: 'r-x', rating: 3 });

    expect(res.ok).toBe(false);
    expect(typeof res.error).toBe('string');
  });
});

// ── canEditReview (Slice 34) ───────────────────────────────────────────────

describe('canEditReview', () => {
  it('returns true when review is 23 hours old (within 24h window)', () => {
    const twentyThreeHoursAgo = new Date(Date.now() - 23 * 3600 * 1000).toISOString();
    expect(canEditReview({ created_at: twentyThreeHoursAgo })).toBe(true);
  });

  it('returns false when review is 25 hours old (outside 24h window)', () => {
    const twentyFiveHoursAgo = new Date(Date.now() - 25 * 3600 * 1000).toISOString();
    expect(canEditReview({ created_at: twentyFiveHoursAgo })).toBe(false);
  });

  it('returns true for a brand-new review (just created)', () => {
    const justNow = new Date().toISOString();
    expect(canEditReview({ created_at: justNow })).toBe(true);
  });

  it('returns false for a review exactly at 24h boundary (exclusive)', () => {
    // Exactly 24h ago is NOT within the window (< 24h is required)
    const exactly24hAgo = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    expect(canEditReview({ created_at: exactly24hAgo })).toBe(false);
  });

  it('is pure — makes no supabase calls', () => {
    const time = new Date(Date.now() - 1000).toISOString();
    canEditReview({ created_at: time });
    expect(mockRpc).not.toHaveBeenCalled();
    expect(mockSelect).not.toHaveBeenCalled();
  });
});

// ── adminGetAllReviews pagination ──────────────────────────────────────────

describe('adminGetAllReviews pagination', () => {
  it('calls .range(10, 19) when called with page=1, pageSize=10', async () => {
    mockRange.mockResolvedValue({ data: [{ id: 'r1' }], error: null });
    const result = await adminGetAllReviews(1, 10);
    expect(mockRange).toHaveBeenCalledWith(10, 19);
    expect(result).toEqual([{ id: 'r1' }]);
  });

  it('does NOT call .range when called with no args', async () => {
    mockOrder.mockResolvedValue({ data: [{ id: 'r1' }], error: null });
    const result = await adminGetAllReviews();
    expect(result).toEqual([{ id: 'r1' }]);
    expect(mockRange).not.toHaveBeenCalled();
  });
});
