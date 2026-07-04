import {
  getMyNotifications,
  markNotificationRead,
  markAllNotificationsRead,
} from '@/lib/notifications';

// ── Mock Supabase ──────────────────────────────────────────────────────────

const getUser = jest.fn();
const order = jest.fn();
const range = jest.fn();
const update = jest.fn();
const updateEq = jest.fn();
const updateEqEq = jest.fn();

// Note: variables used inside jest.mock() factory must be prefixed with "mock" (Jest rule).
const mockGetUser = getUser;
const mockOrder = order;
const mockRange = range;
const mockUpdate = update;
const mockUpdateEq = updateEq;
const mockUpdateEqEq = updateEqEq;

jest.mock('@/lib/supabase', () => ({
  supabase: {
    auth: { getUser: (...a: unknown[]) => mockGetUser(...a) },
    from: () => ({
      select: () => ({
        order: (...a: unknown[]) => {
          const promise = mockOrder(...a) as Promise<unknown>;
          (promise as unknown as { range: (...b: unknown[]) => unknown }).range =
            (...b: unknown[]) => mockRange(...b);
          return promise;
        },
      }),
      update: (...a: unknown[]) => mockUpdate(...a),
    }),
  },
}));

beforeEach(() => {
  jest.clearAllMocks();
});

// ── Tests ──────────────────────────────────────────────────────────────────

describe('getMyNotifications', () => {
  it('getMyNotifications returns rows newest-first', async () => {
    order.mockResolvedValue({ data: [{ id: 'n1', is_read: false }], error: null });
    expect(await getMyNotifications()).toEqual([{ id: 'n1', is_read: false }]);
    expect(order).toHaveBeenCalledWith('created_at', { ascending: false });
  });

  it('returns [] when none', async () => {
    order.mockResolvedValue({ data: null, error: null });
    expect(await getMyNotifications()).toEqual([]);
  });
});

describe('markNotificationRead', () => {
  it('markNotificationRead updates is_read by id', async () => {
    update.mockReturnValue({ eq: (...a: unknown[]) => mockUpdateEq(...a) });
    updateEq.mockResolvedValue({ error: null });
    expect(await markNotificationRead('n1')).toEqual({ ok: true });
    expect(update).toHaveBeenCalledWith({ is_read: true });
    expect(updateEq).toHaveBeenCalledWith('id', 'n1');
  });

  it('returns error when update fails', async () => {
    update.mockReturnValue({ eq: (...a: unknown[]) => mockUpdateEq(...a) });
    updateEq.mockResolvedValue({ error: { message: 'update failed' } });
    const res = await markNotificationRead('n1');
    expect(res).toEqual({ ok: false, error: 'Could not mark notification as read. Please try again.' });
  });
});

describe('markAllNotificationsRead', () => {
  it('markAllNotificationsRead updates own unread rows', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'u1' } } });
    update.mockReturnValue({ eq: () => ({ eq: (...a: unknown[]) => mockUpdateEqEq(...a) }) });
    updateEqEq.mockResolvedValue({ error: null });
    expect(await markAllNotificationsRead()).toEqual({ ok: true });
    expect(update).toHaveBeenCalledWith({ is_read: true });
  });

  it('returns error when signed out', async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    const res = await markAllNotificationsRead();
    expect(res).toEqual({ ok: false, error: 'You must be signed in.' });
  });
});

// ── getMyNotifications pagination ──────────────────────────────────────────

describe('getMyNotifications pagination', () => {
  it('calls .range(10, 19) when called with page=1, pageSize=10', async () => {
    range.mockResolvedValue({ data: [{ id: 'n1', is_read: false }], error: null });
    const result = await getMyNotifications(1, 10);
    expect(mockRange).toHaveBeenCalledWith(10, 19);
    expect(result).toEqual([{ id: 'n1', is_read: false }]);
  });

  it('does NOT call .range when called with no args', async () => {
    order.mockResolvedValue({ data: [{ id: 'n1', is_read: false }], error: null });
    const result = await getMyNotifications();
    expect(result).toEqual([{ id: 'n1', is_read: false }]);
    expect(mockRange).not.toHaveBeenCalled();
  });
});
