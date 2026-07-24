import { type Page, type Route } from '@playwright/test';

/**
 * Deterministic network stubs for the Executive Dashboard's Supabase analytics
 * RPCs (`POST <supabase>/rest/v1/rpc/analytics_*`).
 *
 * Why stub: the dashboard's values/states must be exact and reproducible for
 * assertions, and we must be able to *force* loading / error / empty / populated
 * states on demand — none of which live DB data can guarantee. Stubbing removes
 * the DB-seeding dependency entirely (only the admin *session* remains a real
 * dependency; see the suite's auth gating).
 *
 * Only the analytics RPCs are intercepted — auth/session/profile traffic is left
 * untouched so the real admin session (Approach A) is used to pass the guard.
 */

export const ANALYTICS_RPCS = [
  'analytics_executive_overview',
  'analytics_service_categories',
  'analytics_growth_timeseries',
  'analytics_notification_delivery',
  'analytics_bookings_timeseries',
  'analytics_financial_timeseries',
  'analytics_providers',
  'analytics_services',
  'analytics_geography',
] as const;

export type AnalyticsRpc = (typeof ANALYTICS_RPCS)[number];

/** Populated single-row overview (the 22 columns of `analytics_executive_overview`). */
export const POPULATED_OVERVIEW = {
  current_wallet_balance: 125000,
  current_active_customers: 42,
  current_active_providers: 12,
  current_platform_rating: 4.6,
  active_disputes: 3,
  open_support_tickets: 5,
  pending_jobs: 7,
  in_progress_jobs: 4,
  total_bookings: 120,
  active_bookings: 20,
  completed_bookings: 90,
  cancelled_bookings: 10,
  total_revenue: 450000,
  platform_commission: 45000,
  avg_booking_value: 5000,
  repeat_customer_rate: 0.35,
  new_customers: 18,
  new_providers: 4,
  avg_response_minutes: 12,
  avg_completion_minutes: 95,
  failed_payments: 2,
  period_avg_rating: 4.5,
} as const;

/** Previous-period overview (lower, so Growth deltas render a downward direction from current). */
export const PREVIOUS_OVERVIEW = {
  ...POPULATED_OVERVIEW,
  new_customers: 9,
  new_providers: 2,
  total_revenue: 300000,
  total_bookings: 80,
} as const;

/** All-zero overview for the empty state. */
export const ZERO_OVERVIEW: Record<keyof typeof POPULATED_OVERVIEW, number> = Object.fromEntries(
  Object.keys(POPULATED_OVERVIEW).map((k) => [k, 0]),
) as Record<keyof typeof POPULATED_OVERVIEW, number>;

const LIST_FIXTURES: Record<Exclude<AnalyticsRpc, 'analytics_executive_overview'>, unknown[]> = {
  analytics_service_categories: [
    { category: 'House Cleaning', bookings: 40, revenue: 160000, featured_bookings: 10 },
    { category: 'Plumbing', bookings: 25, revenue: 90000, featured_bookings: 3 },
  ],
  analytics_growth_timeseries: [
    { period: '2026-07-01', new_customers: 5, new_providers: 1 },
    { period: '2026-07-08', new_customers: 8, new_providers: 2 },
  ],
  analytics_notification_delivery: [
    { push_status: 'sent', total: 340 },
    { push_status: 'failed', total: 6 },
  ],
  analytics_bookings_timeseries: [
    { period: '2026-07-01', total: 30, completed: 22, cancelled: 3 },
    { period: '2026-07-08', total: 45, completed: 33, cancelled: 4 },
  ],
  analytics_financial_timeseries: [
    { period: '2026-07-01', revenue: 120000, provider_payouts: 90000, quickserve_revenue: 12000, wallet_used: 5000, promo_used: 2000 },
    { period: '2026-07-08', revenue: 180000, provider_payouts: 135000, quickserve_revenue: 18000, wallet_used: 7000, promo_used: 2500 },
  ],
  analytics_providers: [
    { provider_id: 'p1', full_name: 'Grace Otieno', completed_jobs: 40, avg_rating: 4.9, total_earnings: 180000, completion_rate: 0.95 },
    { provider_id: 'p2', full_name: 'Brian Kamau', completed_jobs: 30, avg_rating: 4.6, total_earnings: 140000, completion_rate: 0.9 },
  ],
  analytics_services: [
    { service_id: 'house-cleaning', bookings: 40, revenue: 160000, avg_job_value: 4000, cancellation_rate: 0.05 },
    { service_id: 'plumbing', bookings: 25, revenue: 90000, avg_job_value: 3600, cancellation_rate: 0.08 },
  ],
  analytics_geography: [
    { area: 'Nairobi', bookings: 70, revenue: 300000, active_providers: 8 },
    { area: 'Mombasa', bookings: 30, revenue: 120000, active_providers: 4 },
  ],
};

/** How a given RPC should respond. */
export type StubMode = 'populated' | 'empty' | 'error';

export type StubOptions = {
  /** Global response mode (default 'populated'). */
  mode?: StubMode;
  /** RPCs that should fail with 500 regardless of `mode` (for per-section error tests). */
  failing?: AnalyticsRpc[];
  /** Delay every stubbed response by N ms (to observe loading skeletons). */
  delayMs?: number;
  /**
   * Return distinct current-vs-previous overview rows so Growth deltas are
   * non-zero. The earlier `p_from` request (previous period) gets
   * PREVIOUS_OVERVIEW; the later gets POPULATED_OVERVIEW.
   */
  distinctPreviousPeriod?: boolean;
};

function jsonBody(rows: unknown): string {
  return JSON.stringify(rows);
}

async function respond(route: Route, rows: unknown, delayMs?: number): Promise<void> {
  if (delayMs && delayMs > 0) await new Promise((r) => setTimeout(r, delayMs));
  await route.fulfill({ status: 200, contentType: 'application/json', body: jsonBody(rows) });
}

async function respondError(route: Route, delayMs?: number): Promise<void> {
  if (delayMs && delayMs > 0) await new Promise((r) => setTimeout(r, delayMs));
  await route.fulfill({ status: 500, contentType: 'application/json', body: jsonBody({ message: 'stubbed analytics failure' }) });
}

/** Overview row selection, optionally distinguishing current vs previous by `p_from`. */
function overviewRowsFor(route: Route, opts: StubOptions): unknown[] {
  if (opts.mode === 'empty') return [ZERO_OVERVIEW];
  if (!opts.distinctPreviousPeriod) return [POPULATED_OVERVIEW];
  try {
    const body = route.request().postDataJSON() as { p_from?: string; p_to?: string } | null;
    const from = body?.p_from ? Date.parse(body.p_from) : Number.NaN;
    // The dashboard issues two overview calls; the previous period has the earlier p_from.
    // We remember the earliest p_from seen and treat that call as "previous".
    if (!Number.isNaN(from)) {
      overviewFromSeen.push(from);
      const earliest = Math.min(...overviewFromSeen);
      if (from === earliest && overviewFromSeen.length > 1) return [PREVIOUS_OVERVIEW];
    }
  } catch {
    /* fall through to the populated default */
  }
  return [POPULATED_OVERVIEW];
}

// Per-install scratch for the distinct-period heuristic. Reset on each install.
let overviewFromSeen: number[] = [];

/**
 * Install analytics RPC stubs on `page`. Call BEFORE navigating to the dashboard.
 * Returns nothing; routes stay active for the page's lifetime.
 */
export async function stubExecutiveAnalytics(page: Page, options: StubOptions = {}): Promise<void> {
  const opts: StubOptions = { mode: 'populated', ...options };
  const failing = new Set(opts.failing ?? []);
  overviewFromSeen = [];

  for (const rpc of ANALYTICS_RPCS) {
    await page.route(`**/rest/v1/rpc/${rpc}`, async (route) => {
      if (failing.has(rpc) || opts.mode === 'error') {
        await respondError(route, opts.delayMs);
        return;
      }
      if (rpc === 'analytics_executive_overview') {
        await respond(route, overviewRowsFor(route, opts), opts.delayMs);
        return;
      }
      const rows = opts.mode === 'empty' ? [] : LIST_FIXTURES[rpc];
      await respond(route, rows, opts.delayMs);
    });
  }
}
