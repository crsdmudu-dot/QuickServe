import { getBookingActivity } from '@/lib/activity';

// ── Mock Supabase ──────────────────────────────────────────────────────────

const order = jest.fn();
const eq = jest.fn();

// Note: variables used inside jest.mock() factory must be prefixed with "mock" (Jest rule).
const mockOrder = order;
const mockEq = eq;

jest.mock('@/lib/supabase', () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: (...a: unknown[]) => ({
          order: (...b: unknown[]) => mockOrder(...b),
          // also pass eq calls through so we can assert on them
          _eq: mockEq,
        }),
      }),
    }),
  },
}));

// We need eq to be called — re-wire the mock so eq is captured
jest.mock('@/lib/supabase', () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: (...a: unknown[]) => {
          mockEq(...a);
          return { order: (...b: unknown[]) => mockOrder(...b) };
        },
      }),
    }),
  },
}));

beforeEach(() => {
  jest.clearAllMocks();
});

// ── Tests ──────────────────────────────────────────────────────────────────

describe('getBookingActivity', () => {
  it('getBookingActivity returns rows oldest-first', async () => {
    order.mockResolvedValue({ data: [{ id: 'a1', event_type: 'booking_created' }], error: null });
    expect(await getBookingActivity('bk1')).toEqual([{ id: 'a1', event_type: 'booking_created' }]);
    expect(eq).toHaveBeenCalledWith('booking_id', 'bk1');
    expect(order).toHaveBeenCalledWith('created_at', { ascending: true });
  });

  it('returns [] when none', async () => {
    order.mockResolvedValue({ data: null, error: null });
    expect(await getBookingActivity('bk1')).toEqual([]);
  });
});
