// executive-analytics.ts — read-only wrappers for the Slice-38 executive RPCs,
// with a short in-memory TTL cache. Reuses analyticsRange for shared presets.
// No writes, no push, no duplicate business logic.
import { supabase } from '@/lib/supabase';
import { analyticsRange, type RangePreset, type AnalyticsBucket } from '@/lib/analytics';

// ── Range presets (adds last90 + this_year over the Slice-25 presets) ──────────
export type ExecRangePreset = 'today' | 'last7' | 'last30' | 'last90' | 'this_year' | 'custom';

export function executiveRange(
  preset: ExecRangePreset,
  customFrom?: string,
  customTo?: string,
  now: Date = new Date(),
): { from: string; to: string } {
  const to = now.toISOString();
  switch (preset) {
    case 'last90': {
      const d = new Date(now);
      d.setDate(d.getDate() - 90);
      return { from: d.toISOString(), to };
    }
    case 'this_year':
      return { from: new Date(now.getFullYear(), 0, 1).toISOString(), to };
    default:
      // today / last7 / last30 / custom → reuse the Slice-25 helper (no duplication)
      return analyticsRange(preset as RangePreset, customFrom, customTo, now);
  }
}

// ── Types ──────────────────────────────────────────────────────────────────
export type ExecutiveOverview = {
  current_wallet_balance: number;
  current_active_customers: number;
  current_active_providers: number;
  current_platform_rating: number;
  active_disputes: number;
  open_support_tickets: number;
  pending_jobs: number;
  in_progress_jobs: number;
  total_bookings: number;
  active_bookings: number;
  completed_bookings: number;
  cancelled_bookings: number;
  total_revenue: number;
  platform_commission: number;
  avg_booking_value: number;
  repeat_customer_rate: number;
  new_customers: number;
  new_providers: number;
  avg_response_minutes: number | null;
  avg_completion_minutes: number | null;
  failed_payments: number;
  period_avg_rating: number;
};

export type ServiceCategoryStat = {
  category: string;
  bookings: number;
  revenue: number;
  featured_bookings: number;
};

export type GrowthPoint = { period: string; new_customers: number; new_providers: number };

export type NotificationDelivery = { push_status: string; total: number };

export const DEFAULT_OVERVIEW: ExecutiveOverview = {
  current_wallet_balance: 0,
  current_active_customers: 0,
  current_active_providers: 0,
  current_platform_rating: 0,
  active_disputes: 0,
  open_support_tickets: 0,
  pending_jobs: 0,
  in_progress_jobs: 0,
  total_bookings: 0,
  active_bookings: 0,
  completed_bookings: 0,
  cancelled_bookings: 0,
  total_revenue: 0,
  platform_commission: 0,
  avg_booking_value: 0,
  repeat_customer_rate: 0,
  new_customers: 0,
  new_providers: 0,
  avg_response_minutes: null,
  avg_completion_minutes: null,
  failed_payments: 0,
  period_avg_rating: 0,
};

// ── TTL cache ────────────────────────────────────────────────────────────────
type CacheEntry = { value: unknown; ts: number };
const CACHE_TTL_MS = 60_000;
const cache = new Map<string, CacheEntry>();

function cacheKey(rpc: string, from: string, to: string, bucket?: string): string {
  return `${rpc}|${from}|${to}|${bucket ?? ''}`;
}

async function cached<T>(key: string, loader: () => Promise<T>): Promise<T> {
  const now = Date.now();
  const hit = cache.get(key);
  if (hit && now - hit.ts < CACHE_TTL_MS) return hit.value as T;
  const value = await loader();
  cache.set(key, { value, ts: now });
  return value;
}

/** The immediately preceding equal-duration window before [from, to). */
export function previousPeriod(from: string, to: string): { from: string; to: string } {
  const f = new Date(from).getTime();
  const t = new Date(to).getTime();
  const d = t - f;
  return { from: new Date(f - d).toISOString(), to: new Date(f).toISOString() };
}

/** Period-over-period % change, rounded to 1 decimal. Returns null when there is
 *  no valid baseline (previous <= 0) so callers can hide the badge gracefully. */
export function pctDelta(current: number, previous: number): number | null {
  if (!(previous > 0)) return null;
  return Math.round(((current - previous) / previous) * 1000) / 10;
}

/** Clears the executive cache (used by the dashboard's manual refresh). */
export function invalidateExecutiveCache(): void {
  cache.clear();
}

/** Latest cache write time (ms epoch) for a given overview range, or null.
 *  Drives the "Last Updated" indicator in the executive dashboard. */
export function getOverviewTimestamp(from: string, to: string): number | null {
  return cache.get(cacheKey('analytics_executive_overview', from, to))?.ts ?? null;
}

// ── Wrappers ────────────────────────────────────────────────────────────────

/** Fetches the 22-column executive overview for a date range. Returns DEFAULT_OVERVIEW on error. */
export async function getExecutiveOverview(from: string, to: string): Promise<ExecutiveOverview> {
  return cached(cacheKey('analytics_executive_overview', from, to), async () => {
    const { data, error } = await supabase.rpc('analytics_executive_overview', { p_from: from, p_to: to });
    if (error) return DEFAULT_OVERVIEW;
    return (data as ExecutiveOverview[] | null)?.[0] ?? DEFAULT_OVERVIEW;
  });
}

/** Fetches per-category booking/revenue breakdown for a date range. Returns [] on error. */
export async function getServiceCategories(from: string, to: string): Promise<ServiceCategoryStat[]> {
  return cached(cacheKey('analytics_service_categories', from, to), async () => {
    const { data, error } = await supabase.rpc('analytics_service_categories', { p_from: from, p_to: to });
    if (error) return [];
    return (data as ServiceCategoryStat[] | null) ?? [];
  });
}

/** Fetches customer/provider growth timeseries bucketed by day/week/month. Returns [] on error. */
export async function getGrowthTimeseries(
  from: string,
  to: string,
  bucket: AnalyticsBucket,
): Promise<GrowthPoint[]> {
  return cached(cacheKey('analytics_growth_timeseries', from, to, bucket), async () => {
    const { data, error } = await supabase.rpc('analytics_growth_timeseries', {
      p_from: from,
      p_to: to,
      p_bucket: bucket,
    });
    if (error) return [];
    return (data as GrowthPoint[] | null) ?? [];
  });
}

/** Fetches push notification delivery stats for a date range. Returns [] on error. */
export async function getNotificationDelivery(from: string, to: string): Promise<NotificationDelivery[]> {
  return cached(cacheKey('analytics_notification_delivery', from, to), async () => {
    const { data, error } = await supabase.rpc('analytics_notification_delivery', { p_from: from, p_to: to });
    if (error) return [];
    return (data as NotificationDelivery[] | null) ?? [];
  });
}
