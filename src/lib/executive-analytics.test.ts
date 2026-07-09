// executive-analytics.test.ts — unit tests for the Slice-38 executive analytics lib.
// Covers: TTL cache hit, cache expiry (via fake timers), cache invalidation,
// range presets (last90, this_year, delegated last7), and wrapper error handling.

import {
  executiveRange,
  getExecutiveOverview,
  getServiceCategories,
  getGrowthTimeseries,
  getNotificationDelivery,
  invalidateExecutiveCache,
  getOverviewTimestamp,
} from './executive-analytics';

jest.mock('@/lib/supabase', () => ({
  supabase: { rpc: jest.fn() },
}));
import { supabase } from '@/lib/supabase';
const mockRpc = supabase.rpc as jest.Mock;

const NOW = new Date('2026-07-09T12:00:00Z');

// ── executiveRange ────────────────────────────────────────────────────────────

describe('executiveRange', () => {
  test('last90 is 90 days before now', () => {
    const { from, to } = executiveRange('last90', undefined, undefined, NOW);
    expect(to).toBe(NOW.toISOString());
    expect(from).toBe(new Date('2026-04-10T12:00:00Z').toISOString());
  });

  test('this_year starts at Jan 1 local', () => {
    const { from } = executiveRange('this_year', undefined, undefined, NOW);
    expect(new Date(from).getFullYear()).toBe(2026);
    expect(new Date(from).getMonth()).toBe(0);
  });

  test('shared presets delegate to analyticsRange (last7)', () => {
    const { from, to } = executiveRange('last7', undefined, undefined, NOW);
    expect(to).toBe(NOW.toISOString());
    expect(from).toBe(new Date('2026-07-02T12:00:00Z').toISOString());
  });

  test('last30 delegates to analyticsRange', () => {
    const { from, to } = executiveRange('last30', undefined, undefined, NOW);
    expect(to).toBe(NOW.toISOString());
    expect(from).toBe(new Date('2026-06-09T12:00:00Z').toISOString());
  });

  test('custom preset delegates to analyticsRange with provided dates', () => {
    const { from, to } = executiveRange('custom', '2026-01-01T00:00:00Z', '2026-06-30T00:00:00Z', NOW);
    expect(from).toBe('2026-01-01T00:00:00Z');
    expect(to).toBe('2026-06-30T00:00:00Z');
  });
});

// ── getExecutiveOverview + TTL cache ─────────────────────────────────────────

describe('getExecutiveOverview + TTL cache', () => {
  beforeEach(() => {
    invalidateExecutiveCache();
    mockRpc.mockReset();
  });

  test('calls analytics_executive_overview with p_from/p_to and returns the row', async () => {
    mockRpc.mockResolvedValue({ data: [{ total_bookings: 5, current_wallet_balance: 100 }], error: null });
    const r = await getExecutiveOverview('A', 'B');
    expect(mockRpc).toHaveBeenCalledWith('analytics_executive_overview', { p_from: 'A', p_to: 'B' });
    expect(r.total_bookings).toBe(5);
    expect(r.current_wallet_balance).toBe(100);
  });

  test('second call within TTL is served from cache (rpc called once)', async () => {
    mockRpc.mockResolvedValue({ data: [{ total_bookings: 1 }], error: null });
    await getExecutiveOverview('A', 'B');
    await getExecutiveOverview('A', 'B');
    expect(mockRpc).toHaveBeenCalledTimes(1);
  });

  test('invalidateExecutiveCache forces a refetch', async () => {
    mockRpc.mockResolvedValue({ data: [{ total_bookings: 1 }], error: null });
    await getExecutiveOverview('A', 'B');
    invalidateExecutiveCache();
    await getExecutiveOverview('A', 'B');
    expect(mockRpc).toHaveBeenCalledTimes(2);
  });

  test('cache expires after TTL and triggers a fresh rpc call', async () => {
    jest.useFakeTimers();
    try {
      mockRpc.mockResolvedValue({ data: [{ total_bookings: 99 }], error: null });
      invalidateExecutiveCache();

      jest.setSystemTime(new Date('2026-07-09T12:00:00Z'));
      await getExecutiveOverview('A', 'B');
      expect(mockRpc).toHaveBeenCalledTimes(1);

      // Advance past the 60-second TTL
      jest.setSystemTime(new Date('2026-07-09T12:01:01Z'));
      await getExecutiveOverview('A', 'B');
      expect(mockRpc).toHaveBeenCalledTimes(2);
    } finally {
      jest.useRealTimers();
    }
  });

  test('returns zeroed default on error', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'x' } });
    const r = await getExecutiveOverview('A', 'B');
    expect(r.total_bookings).toBe(0);
    expect(r.avg_response_minutes).toBeNull();
  });

  test('returns DEFAULT_OVERVIEW with null nullable fields on error', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'fail' } });
    const r = await getExecutiveOverview('X', 'Y');
    expect(r.avg_response_minutes).toBeNull();
    expect(r.avg_completion_minutes).toBeNull();
    expect(r.total_revenue).toBe(0);
    expect(r.platform_commission).toBe(0);
  });
});

// ── getOverviewTimestamp ──────────────────────────────────────────────────────

describe('getOverviewTimestamp', () => {
  beforeEach(() => {
    invalidateExecutiveCache();
    mockRpc.mockReset();
  });

  test('returns null before any call', () => {
    expect(getOverviewTimestamp('A', 'B')).toBeNull();
  });

  test('returns a ms epoch after a successful fetch', async () => {
    jest.useFakeTimers();
    try {
      const t0 = new Date('2026-07-09T12:00:00Z').getTime();
      jest.setSystemTime(t0);
      mockRpc.mockResolvedValue({ data: [{ total_bookings: 1 }], error: null });
      await getExecutiveOverview('A', 'B');
      expect(getOverviewTimestamp('A', 'B')).toBe(t0);
    } finally {
      jest.useRealTimers();
    }
  });

  test('returns null after cache invalidation', async () => {
    mockRpc.mockResolvedValue({ data: [{ total_bookings: 1 }], error: null });
    await getExecutiveOverview('A', 'B');
    invalidateExecutiveCache();
    expect(getOverviewTimestamp('A', 'B')).toBeNull();
  });
});

// ── getServiceCategories ──────────────────────────────────────────────────────

describe('getServiceCategories', () => {
  beforeEach(() => {
    invalidateExecutiveCache();
    mockRpc.mockReset();
  });

  test('calls analytics_service_categories and returns rows', async () => {
    const rows = [{ category: 'Cleaning', bookings: 10, revenue: 500, featured_bookings: 2 }];
    mockRpc.mockResolvedValue({ data: rows, error: null });
    const r = await getServiceCategories('A', 'B');
    expect(mockRpc).toHaveBeenCalledWith('analytics_service_categories', { p_from: 'A', p_to: 'B' });
    expect(r).toEqual(rows);
  });

  test('returns [] on error', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'err' } });
    const r = await getServiceCategories('A', 'B');
    expect(r).toEqual([]);
  });

  test('second call within TTL uses cache', async () => {
    mockRpc.mockResolvedValue({ data: [], error: null });
    await getServiceCategories('A', 'B');
    await getServiceCategories('A', 'B');
    expect(mockRpc).toHaveBeenCalledTimes(1);
  });
});

// ── getGrowthTimeseries ───────────────────────────────────────────────────────

describe('getGrowthTimeseries', () => {
  beforeEach(() => {
    invalidateExecutiveCache();
    mockRpc.mockReset();
  });

  test('calls analytics_growth_timeseries with bucket param', async () => {
    const rows = [{ period: '2026-07-01', new_customers: 3, new_providers: 1 }];
    mockRpc.mockResolvedValue({ data: rows, error: null });
    const r = await getGrowthTimeseries('A', 'B', 'day');
    expect(mockRpc).toHaveBeenCalledWith('analytics_growth_timeseries', {
      p_from: 'A',
      p_to: 'B',
      p_bucket: 'day',
    });
    expect(r).toEqual(rows);
  });

  test('returns [] on error', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'err' } });
    const r = await getGrowthTimeseries('A', 'B', 'week');
    expect(r).toEqual([]);
  });

  test('different buckets use separate cache keys', async () => {
    mockRpc.mockResolvedValue({ data: [], error: null });
    await getGrowthTimeseries('A', 'B', 'day');
    await getGrowthTimeseries('A', 'B', 'week');
    expect(mockRpc).toHaveBeenCalledTimes(2);
  });
});

// ── getNotificationDelivery ───────────────────────────────────────────────────

describe('getNotificationDelivery', () => {
  beforeEach(() => {
    invalidateExecutiveCache();
    mockRpc.mockReset();
  });

  test('calls analytics_notification_delivery and returns rows', async () => {
    const rows = [{ push_status: 'delivered', total: 100 }];
    mockRpc.mockResolvedValue({ data: rows, error: null });
    const r = await getNotificationDelivery('A', 'B');
    expect(mockRpc).toHaveBeenCalledWith('analytics_notification_delivery', { p_from: 'A', p_to: 'B' });
    expect(r).toEqual(rows);
  });

  test('returns [] on error', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'err' } });
    const r = await getNotificationDelivery('A', 'B');
    expect(r).toEqual([]);
  });
});
