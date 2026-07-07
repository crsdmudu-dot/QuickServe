import {
  getMyNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  getUnreadNotificationCount,
  filterNotifications,
  groupNotificationsByDate,
  emitNotification,
  broadcastAnnouncement,
  getNotificationPreferences,
  DEFAULT_NOTIFICATION_PREFERENCES,
  type AppNotification,
} from '@/lib/notifications';

// ── Mock Supabase ──────────────────────────────────────────────────────────

const getUser = jest.fn();
const order = jest.fn();
const range = jest.fn();
const update = jest.fn();
const updateEq = jest.fn();
const updateEqEq = jest.fn();
const maybeSingle = jest.fn();
const upsert = jest.fn();
const rpc = jest.fn();
const selectCount = jest.fn();
const selectCountEq = jest.fn();

// Note: variables used inside jest.mock() factory must be prefixed with "mock" (Jest rule).
const mockGetUser = getUser;
const mockOrder = order;
const mockRange = range;
const mockUpdate = update;
const mockUpdateEq = updateEq;
const mockUpdateEqEq = updateEqEq;
const mockMaybeSingle = maybeSingle;
const mockUpsert = upsert;
const mockRpc = rpc;
const mockSelectCount = selectCount;
const mockSelectCountEq = selectCountEq;

jest.mock('@/lib/supabase', () => ({
  supabase: {
    auth: { getUser: (...a: unknown[]) => mockGetUser(...a) },
    from: (_table: string) => ({
      select: (...selectArgs: unknown[]) => {
        // Head count query (getUnreadNotificationCount)
        if (
          selectArgs.length === 2 &&
          selectArgs[0] === '*' &&
          typeof selectArgs[1] === 'object' &&
          selectArgs[1] !== null &&
          (selectArgs[1] as Record<string, unknown>).count === 'exact'
        ) {
          return {
            eq: (...a: unknown[]) => mockSelectCountEq(...a),
          };
        }
        // Preferences query
        return {
          maybeSingle: (...a: unknown[]) => mockMaybySingle(...a),
          order: (...a: unknown[]) => {
            const promise = mockOrder(...a) as Promise<unknown>;
            (promise as unknown as { range: (...b: unknown[]) => unknown }).range =
              (...b: unknown[]) => mockRange(...b);
            return promise;
          },
        };
      },
      update: (...a: unknown[]) => mockUpdate(...a),
      upsert: (...a: unknown[]) => mockUpsert(...a),
    }),
    rpc: (...a: unknown[]) => mockRpc(...a),
  },
}));

// alias to avoid the mock name issue in the factory
const mockMaybySingle = maybeSingle;

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
  it('markNotificationRead updates is_read and read_at by id', async () => {
    update.mockReturnValue({ eq: (...a: unknown[]) => mockUpdateEq(...a) });
    updateEq.mockResolvedValue({ error: null });
    expect(await markNotificationRead('n1')).toEqual({ ok: true });
    // Verify read_at is included in the update payload
    const updateArg = update.mock.calls[0][0] as Record<string, unknown>;
    expect(updateArg.is_read).toBe(true);
    expect(typeof updateArg.read_at).toBe('string');
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
  it('markAllNotificationsRead updates own unread rows and sets read_at', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'u1' } } });
    update.mockReturnValue({ eq: () => ({ eq: (...a: unknown[]) => mockUpdateEqEq(...a) }) });
    updateEqEq.mockResolvedValue({ error: null });
    expect(await markAllNotificationsRead()).toEqual({ ok: true });
    const updateArg = update.mock.calls[0][0] as Record<string, unknown>;
    expect(updateArg.is_read).toBe(true);
    expect(typeof updateArg.read_at).toBe('string');
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

// ── getUnreadNotificationCount ─────────────────────────────────────────────

describe('getUnreadNotificationCount', () => {
  it('returns count from query', async () => {
    selectCountEq.mockResolvedValue({ count: 5, error: null });
    expect(await getUnreadNotificationCount()).toBe(5);
    expect(selectCountEq).toHaveBeenCalledWith('is_read', false);
  });

  it('returns 0 when count is null', async () => {
    selectCountEq.mockResolvedValue({ count: null, error: null });
    expect(await getUnreadNotificationCount()).toBe(0);
  });

  it('returns 0 on error', async () => {
    selectCountEq.mockResolvedValue({ count: null, error: { message: 'failed' } });
    expect(await getUnreadNotificationCount()).toBe(0);
  });
});

// ── getNotificationPreferences ─────────────────────────────────────────────

describe('getNotificationPreferences', () => {
  it('returns defaults when no row exists', async () => {
    maybeSingle.mockResolvedValue({ data: null });
    const prefs = await getNotificationPreferences();
    expect(prefs).toEqual(DEFAULT_NOTIFICATION_PREFERENCES);
  });

  it('maps all 9 fields including new 4 toggles', async () => {
    maybeSingle.mockResolvedValue({
      data: {
        push_enabled: true,
        chat_enabled: false,
        booking_enabled: true,
        payment_enabled: false,
        marketing_enabled: true,
        quality_enabled: false,
        system_enabled: true,
        email_enabled: true,
        sms_enabled: false,
      },
    });
    const prefs = await getNotificationPreferences();
    expect(prefs.push_enabled).toBe(true);
    expect(prefs.chat_enabled).toBe(false);
    expect(prefs.quality_enabled).toBe(false);
    expect(prefs.system_enabled).toBe(true);
    expect(prefs.email_enabled).toBe(true);
    expect(prefs.sms_enabled).toBe(false);
  });

  it('defaults to safe values for missing new columns (null coalesce)', async () => {
    maybeSingle.mockResolvedValue({
      data: {
        push_enabled: true,
        chat_enabled: true,
        booking_enabled: true,
        payment_enabled: true,
        marketing_enabled: false,
        // new columns absent / null
        quality_enabled: null,
        system_enabled: null,
        email_enabled: null,
        sms_enabled: null,
      },
    });
    const prefs = await getNotificationPreferences();
    expect(prefs.quality_enabled).toBe(true);
    expect(prefs.system_enabled).toBe(true);
    expect(prefs.email_enabled).toBe(false);
    expect(prefs.sms_enabled).toBe(false);
  });
});

// ── DEFAULT_NOTIFICATION_PREFERENCES ──────────────────────────────────────

describe('DEFAULT_NOTIFICATION_PREFERENCES', () => {
  it('has quality and system defaulting to true', () => {
    expect(DEFAULT_NOTIFICATION_PREFERENCES.quality_enabled).toBe(true);
    expect(DEFAULT_NOTIFICATION_PREFERENCES.system_enabled).toBe(true);
  });

  it('has email and sms defaulting to false', () => {
    expect(DEFAULT_NOTIFICATION_PREFERENCES.email_enabled).toBe(false);
    expect(DEFAULT_NOTIFICATION_PREFERENCES.sms_enabled).toBe(false);
  });
});

// ── emitNotification ──────────────────────────────────────────────────────

describe('emitNotification', () => {
  it('calls emit_notification RPC with correct p_ params', async () => {
    rpc.mockResolvedValue({ data: 'new-uuid', error: null });
    const res = await emitNotification({
      userId: 'u1',
      audienceType: 'customer',
      notificationType: 'booking_accepted',
      category: 'booking',
      title: 'Booking Accepted',
      body: 'Your booking has been accepted.',
      deepLink: '/booking/123',
      metadata: { foo: 'bar' },
      priority: 'normal',
    });
    expect(res).toEqual({ ok: true, id: 'new-uuid' });
    expect(rpc).toHaveBeenCalledWith('emit_notification', {
      p_user_id: 'u1',
      p_audience_type: 'customer',
      p_notification_type: 'booking_accepted',
      p_category: 'booking',
      p_title: 'Booking Accepted',
      p_body: 'Your booking has been accepted.',
      p_deep_link: '/booking/123',
      p_metadata: { foo: 'bar' },
      p_priority: 'normal',
    });
  });

  it('returns ok:false with friendly message on RPC error', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'rpc failed' } });
    const res = await emitNotification({
      userId: 'u1',
      notificationType: 'generic',
      category: 'system',
      title: 'Test',
      body: 'Test body',
    });
    expect(res).toEqual({ ok: false, error: 'Could not emit notification. Please try again.' });
  });

  it('passes undefined optional params without throw', async () => {
    rpc.mockResolvedValue({ data: null, error: null });
    const res = await emitNotification({
      userId: 'u2',
      notificationType: 'generic',
      category: 'system',
      title: 'Hi',
      body: 'Body',
    });
    expect(res.ok).toBe(true);
  });
});

// ── broadcastAnnouncement ─────────────────────────────────────────────────

describe('broadcastAnnouncement', () => {
  it('calls broadcast_announcement RPC with correct p_ params', async () => {
    rpc.mockResolvedValue({ data: 42, error: null });
    const res = await broadcastAnnouncement({
      audienceType: 'customer',
      title: 'Big sale!',
      body: 'Check our deals.',
      deepLink: '/promotions',
      priority: 'high',
    });
    expect(res).toEqual({ ok: true, count: 42 });
    expect(rpc).toHaveBeenCalledWith('broadcast_announcement', {
      p_audience_type: 'customer',
      p_title: 'Big sale!',
      p_body: 'Check our deals.',
      p_deep_link: '/promotions',
      p_priority: 'high',
    });
  });

  it('returns ok:false with friendly message on RPC error', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'rpc failed' } });
    const res = await broadcastAnnouncement({
      audienceType: 'admin',
      title: 'Alert',
      body: 'System down.',
    });
    expect(res).toEqual({ ok: false, error: 'Could not broadcast announcement. Please try again.' });
  });
});

// ── filterNotifications ───────────────────────────────────────────────────

describe('filterNotifications', () => {
  const notifications: AppNotification[] = [
    { id: '1', user_id: 'u', booking_id: null, title: 'A', body: '', is_read: false, created_at: '2024-01-01T00:00:00Z', category: 'booking' },
    { id: '2', user_id: 'u', booking_id: null, title: 'B', body: '', is_read: true,  created_at: '2024-01-01T00:00:00Z', category: 'payment' },
    { id: '3', user_id: 'u', booking_id: null, title: 'C', body: '', is_read: false, created_at: '2024-01-01T00:00:00Z', category: 'promotion' },
    { id: '4', user_id: 'u', booking_id: null, title: 'D', body: '', is_read: true,  created_at: '2024-01-01T00:00:00Z', category: 'system' },
    { id: '5', user_id: 'u', booking_id: null, title: 'E', body: '', is_read: false, created_at: '2024-01-01T00:00:00Z', category: 'chat' },
  ];

  it('all → returns all', () => {
    expect(filterNotifications(notifications, 'all')).toHaveLength(5);
  });

  it('unread → only unread', () => {
    const result = filterNotifications(notifications, 'unread');
    expect(result.map((n) => n.id)).toEqual(['1', '3', '5']);
  });

  it('booking → only booking category', () => {
    const result = filterNotifications(notifications, 'booking');
    expect(result.map((n) => n.id)).toEqual(['1']);
  });

  it('payments → only payment category', () => {
    const result = filterNotifications(notifications, 'payments');
    expect(result.map((n) => n.id)).toEqual(['2']);
  });

  it('promotions → only promotion category', () => {
    const result = filterNotifications(notifications, 'promotions');
    expect(result.map((n) => n.id)).toEqual(['3']);
  });

  it('system → only system category', () => {
    const result = filterNotifications(notifications, 'system');
    expect(result.map((n) => n.id)).toEqual(['4']);
  });

  it('falls back to type catalog when category absent', () => {
    const withType: AppNotification[] = [
      { id: '10', user_id: 'u', booking_id: null, title: 'T', body: '', is_read: false, created_at: '2024-01-01T00:00:00Z', type: 'wallet_credit' },
    ];
    // wallet_credit → payment category in the catalog
    expect(filterNotifications(withType, 'payments')).toHaveLength(1);
    expect(filterNotifications(withType, 'booking')).toHaveLength(0);
  });
});

// ── groupNotificationsByDate ──────────────────────────────────────────────

describe('groupNotificationsByDate', () => {
  // Fix "now" to 2024-06-15T12:00:00Z for deterministic tests
  const now = new Date('2024-06-15T12:00:00Z');

  const todayNot: AppNotification    = { id: '1', user_id: 'u', booking_id: null, title: 'Today', body: '', is_read: false, created_at: '2024-06-15T08:00:00Z' };
  const yesterdayNot: AppNotification = { id: '2', user_id: 'u', booking_id: null, title: 'Yesterday', body: '', is_read: false, created_at: '2024-06-14T10:00:00Z' };
  const earlierNot: AppNotification  = { id: '3', user_id: 'u', booking_id: null, title: 'Earlier', body: '', is_read: false, created_at: '2024-06-01T10:00:00Z' };

  it('buckets into Today / Yesterday / Earlier', () => {
    const groups = groupNotificationsByDate([todayNot, yesterdayNot, earlierNot], now);
    expect(groups.map((g) => g.label)).toEqual(['Today', 'Yesterday', 'Earlier']);
    expect(groups[0].items).toEqual([todayNot]);
    expect(groups[1].items).toEqual([yesterdayNot]);
    expect(groups[2].items).toEqual([earlierNot]);
  });

  it('drops empty buckets', () => {
    const groups = groupNotificationsByDate([todayNot], now);
    expect(groups.map((g) => g.label)).toEqual(['Today']);
  });

  it('returns [] for empty input', () => {
    expect(groupNotificationsByDate([], now)).toEqual([]);
  });

  it('preserves within-bucket order (newest first as passed)', () => {
    const n1: AppNotification = { id: 'a', user_id: 'u', booking_id: null, title: '1', body: '', is_read: false, created_at: '2024-06-15T11:00:00Z' };
    const n2: AppNotification = { id: 'b', user_id: 'u', booking_id: null, title: '2', body: '', is_read: false, created_at: '2024-06-15T09:00:00Z' };
    const groups = groupNotificationsByDate([n1, n2], now);
    expect(groups[0].items[0].id).toBe('a');
    expect(groups[0].items[1].id).toBe('b');
  });
});
