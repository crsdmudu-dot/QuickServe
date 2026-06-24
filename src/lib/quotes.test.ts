import {
  setBookingQuote,
  acceptQuote,
  declineQuote,
  getQuoteForBooking,
} from '@/lib/quotes';

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

describe('acceptQuote', () => {
  it('calls accept_quote RPC with correct args on success', async () => {
    rpc.mockResolvedValue({ error: null });
    const res = await acceptQuote('bk1');
    expect(res).toEqual({ ok: true });
    expect(rpc).toHaveBeenCalledWith('accept_quote', { p_booking_id: 'bk1' });
  });

  it('returns friendly error when RPC fails', async () => {
    rpc.mockResolvedValue({ error: { message: 'not found' } });
    const res = await acceptQuote('bk1');
    expect(res).toEqual({ ok: false, error: 'Could not accept quote. Please try again.' });
  });
});

describe('declineQuote', () => {
  it('calls decline_quote RPC with correct args on success', async () => {
    rpc.mockResolvedValue({ error: null });
    const res = await declineQuote('bk1');
    expect(res).toEqual({ ok: true });
    expect(rpc).toHaveBeenCalledWith('decline_quote', { p_booking_id: 'bk1' });
  });

  it('returns friendly error when RPC fails', async () => {
    rpc.mockResolvedValue({ error: { message: 'not found' } });
    const res = await declineQuote('bk1');
    expect(res).toEqual({ ok: false, error: 'Could not decline quote. Please try again.' });
  });
});

describe('getQuoteForBooking', () => {
  it('returns the row on success', async () => {
    maybeSingle.mockResolvedValue({
      data: { quoted_amount: 500, quote_status: 'sent' },
      error: null,
    });
    const res = await getQuoteForBooking('bk1');
    expect(res).toEqual({ quoted_amount: 500, quote_status: 'sent' });
    expect(eq).toHaveBeenCalledWith('id', 'bk1');
  });

  it('returns null on error', async () => {
    maybeSingle.mockResolvedValue({ data: null, error: { message: 'not found' } });
    const res = await getQuoteForBooking('bk1');
    expect(res).toBeNull();
  });

  it('returns null when no row found', async () => {
    maybeSingle.mockResolvedValue({ data: null, error: null });
    const res = await getQuoteForBooking('bk1');
    expect(res).toBeNull();
  });

  it('does NOT select provider_share', async () => {
    maybeSingle.mockResolvedValue({ data: null, error: null });
    await getQuoteForBooking('bk1');
    // The select string must not contain provider_share
    const selectArg: string = mockSelect.mock.calls[0][0];
    expect(selectArg).not.toContain('provider_share');
  });
});
