/**
 * notifications-admin.test.ts — admin-only notifications tests.
 *
 * These describe blocks moved verbatim from src/lib/notifications.test.ts when the admin-only
 * exports were split out of the shared @/lib/notifications module into the admin application.
 * Only the import specifier changed; every assertion is unchanged, so coverage is preserved.
 */

import {
  emitNotification,
  broadcastAnnouncement,
} from '@admin/lib/notifications-admin';

// ── Mock Supabase ──────────────────────────────────────────────────────────

const getUser = jest.fn();
const order = jest.fn();
const range = jest.fn();
const update = jest.fn();
const maybeSingle = jest.fn();
const upsert = jest.fn();
const rpc = jest.fn();
const selectCountEq = jest.fn();

// Note: variables used inside jest.mock() factory must be prefixed with "mock" (Jest rule).
const mockGetUser = getUser;
const mockOrder = order;
const mockRange = range;
const mockUpdate = update;
const mockUpsert = upsert;
const mockRpc = rpc;
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

