import {
  getBookingMessages,
  sendBookingMessage,
  getChatPeerName,
  labelSender,
} from '@/lib/messages';

// ── Mock Supabase ──────────────────────────────────────────────────────────

const getUser = jest.fn();
const insert = jest.fn();
const select = jest.fn();
const eq = jest.fn();
const order = jest.fn();
const rpc = jest.fn();

// Variables used inside jest.mock() factory must be prefixed with "mock" (Jest rule).
const mockGetUser = getUser;
const mockInsert = insert;
const mockSelect = select;
const mockEq = eq;
const mockOrder = order;
const mockRpc = rpc;

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
              order: (...c: unknown[]) => mockOrder(...c),
            };
          },
        };
      },
    }),
    rpc: (...a: unknown[]) => mockRpc(...a),
  },
}));

beforeEach(() => {
  jest.clearAllMocks();
});

// ── Tests ──────────────────────────────────────────────────────────────────

describe('getBookingMessages', () => {
  it('returns rows and asserts eq + order calls', async () => {
    const rows = [{ id: 'm1', booking_id: 'b1', message_text: 'hi' }];
    order.mockResolvedValue({ data: rows, error: null });
    const result = await getBookingMessages('b1');
    expect(result).toEqual(rows);
    expect(eq).toHaveBeenCalledWith('booking_id', 'b1');
    expect(order).toHaveBeenCalledWith('created_at', { ascending: true });
  });

  it('returns [] on error', async () => {
    order.mockResolvedValue({ data: null, error: { message: 'fail' } });
    const result = await getBookingMessages('b1');
    expect(result).toEqual([]);
  });
});

describe('sendBookingMessage', () => {
  it('empty/whitespace text returns error without calling Supabase', async () => {
    const result = await sendBookingMessage('b1', '   ');
    expect(result).toEqual({ ok: false, error: 'Enter a message.' });
    expect(getUser).not.toHaveBeenCalled();
    expect(insert).not.toHaveBeenCalled();
  });

  it('returns error when user is not signed in', async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    const result = await sendBookingMessage('b1', 'hello');
    expect(result).toEqual({ ok: false, error: 'You must be signed in.' });
  });

  it('success: trims text and inserts with sender_id from auth', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'u1' } } });
    insert.mockResolvedValue({ error: null });
    const result = await sendBookingMessage('b1', '  hello  ');
    expect(result).toEqual({ ok: true });
    expect(insert).toHaveBeenCalledWith({
      booking_id: 'b1',
      sender_id: 'u1',
      message_text: 'hello',
    });
  });

  it('insert error returns friendly message', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'u1' } } });
    insert.mockResolvedValue({ error: { message: 'db error' } });
    const result = await sendBookingMessage('b1', 'hello');
    expect(result).toEqual({ ok: false, error: 'Could not send message. Please try again.' });
  });
});

describe('getChatPeerName', () => {
  it('success returns the name and asserts rpc call', async () => {
    rpc.mockResolvedValue({ data: 'Jane Doe', error: null });
    const result = await getChatPeerName('b1');
    expect(result).toBe('Jane Doe');
    expect(rpc).toHaveBeenCalledWith('get_chat_peer_name', { p_booking_id: 'b1' });
  });

  it('returns null on error', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'fail' } });
    const result = await getChatPeerName('b1');
    expect(result).toBeNull();
  });
});

describe('labelSender', () => {
  const booking = { customer_id: 'cust1', assigned_provider_id: 'prov1' };

  it('returns Customer when senderId matches customer_id', () => {
    expect(labelSender('cust1', booking)).toBe('Customer');
  });

  it('returns Provider when senderId matches assigned_provider_id', () => {
    expect(labelSender('prov1', booking)).toBe('Provider');
  });

  it('returns Unknown for unrecognised sender', () => {
    expect(labelSender('other', booking)).toBe('Unknown');
  });
});
