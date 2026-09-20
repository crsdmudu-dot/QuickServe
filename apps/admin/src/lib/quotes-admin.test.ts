/**
 * quotes-admin.test.ts — admin-only quotes tests.
 *
 * These describe blocks moved verbatim from src/lib/quotes.test.ts when the admin-only
 * exports were split out of the shared @/lib/quotes module into the admin application.
 * Only the import specifier changed; every assertion is unchanged, so coverage is preserved.
 */

import {
  setBookingQuote,
} from '@admin/lib/quotes-admin';

// ── Mock Supabase ──────────────────────────────────────────────────────────

const rpc = jest.fn();
const select = jest.fn();
const eq = jest.fn();
const maybeSingle = jest.fn();

// Note: variables used inside jest.mock() factory must be prefixed with "mock" (Jest rule).
const mockRpc = rpc;
const mockSelect = select;
const mockEq = eq;
const mockMaybeSingle = maybeSingle;

jest.mock('@/lib/supabase', () => ({
  supabase: {
    rpc: (...a: unknown[]) => mockRpc(...a),
    from: () => ({
      select: (...a: unknown[]) => {
        mockSelect(...a);
        return {
          eq: (...b: unknown[]) => {
            mockEq(...b);
            return {
              maybeSingle: (...c: unknown[]) => mockMaybeSingle(...c),
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

// ── Tests ──────────────────────────────────────────────────────────────────


describe('setBookingQuote', () => {
  it('calls set_quote RPC with correct args on success', async () => {
    rpc.mockResolvedValue({ error: null });
    const res = await setBookingQuote('bk1', 500, 400);
    expect(res).toEqual({ ok: true });
    expect(rpc).toHaveBeenCalledWith('set_quote', {
      p_booking_id: 'bk1',
      p_amount: 500,
      p_provider_share: 400,
    });
  });

  it('returns friendly error when RPC fails', async () => {
    rpc.mockResolvedValue({ error: { message: 'Permission denied' } });
    const res = await setBookingQuote('bk1', 500, 400);
    expect(res).toEqual({ ok: false, error: 'Could not send quote. Please try again.' });
  });
});

