import { type Page, type Route } from '@playwright/test';

/**
 * Deterministic network stubs for the **Detailed Analytics** screen
 * (`(admin-web)/analytics/detailed.tsx`) — QA Slice 42.
 *
 * The detailed screen calls a DIFFERENT set of Supabase RPCs from the Executive
 * Dashboard (Slice 41), and with different request shapes, so this is a separate,
 * focused module — NOT a generic mocking framework. It reuses the Slice-41
 * interception *pattern* only (a strict tracker + `respond`/`respondError`).
 *
 * The nine detailed RPCs (all `POST <supabase>/rest/v1/rpc/<name>`):
 *   analytics_kpis                 (p_from, p_to)
 *   analytics_bookings_timeseries  (p_from, p_to, p_bucket)
 *   analytics_bookings_summary     (p_from, p_to)
 *   analytics_financial_timeseries (p_from, p_to, p_bucket)
 *   analytics_financial_summary    (p_from, p_to)
 *   analytics_providers            (p_from, p_to, p_limit)
 *   analytics_services             (p_from, p_to)
 *   analytics_geography            (p_from, p_to)
 *   analytics_customers            (p_from, p_to)
 *
 * Only these analytics RPCs are intercepted. Auth/session/profile traffic is left
 * to `mockAdminSession` (reused unchanged).
 */

// ── RPC inventory ────────────────────────────────────────────────────────────

export const DETAILED_ANALYTICS_RPCS = [
  'analytics_kpis',
  'analytics_bookings_timeseries',
  'analytics_bookings_summary',
  'analytics_financial_timeseries',
  'analytics_financial_summary',
  'analytics_providers',
  'analytics_services',
  'analytics_geography',
  'analytics_customers',
] as const;

export type DetailedRpc = (typeof DETAILED_ANALYTICS_RPCS)[number];

/** RPCs that additionally require a `p_bucket` (day/week/month). */
const BUCKETED_RPCS = new Set<DetailedRpc>([
  'analytics_bookings_timeseries',
  'analytics_financial_timeseries',
]);

// ── Row types (mirror src/lib/analytics.ts — defined locally to keep qa/ isolated) ──

export type AnalyticsKpis = {
  revenue: number;
  gross_bookings: number;
  completed_bookings: number;
  active_providers: number;
  active_customers: number;
  avg_booking_value: number;
};

export type BookingsPoint = { period: string; total: number; completed: number; cancelled: number };

export type BookingsSummary = {
  completion_rate: number;
  cancellation_rate: number;
  avg_completion_minutes: number | null;
  pending: number;
  completed: number;
};

export type FinancialPoint = {
  period: string;
  revenue: number;
  provider_payouts: number;
  quickserve_revenue: number;
  wallet_used: number;
  promo_used: number;
};

export type FinancialSummary = {
  revenue: number;
  provider_payouts: number;
  quickserve_revenue: number;
  wallet_used: number;
  promo_used: number;
};

export type ProviderStat = {
  provider_id: string;
  full_name: string | null;
  completed_jobs: number;
  avg_rating: number | null;
  total_earnings: number;
  completion_rate: number;
};

export type ServiceStat = {
  service_id: string;
  bookings: number;
  revenue: number;
  avg_job_value: number;
  cancellation_rate: number;
};

export type GeoStat = { area: string; bookings: number; revenue: number; active_providers: number };

export type CustomerStats = {
  new_customers: number;
  returning_customers: number;
  repeat_booking_rate: number;
  retention_rate: number;
};

// ── Populated fixtures (exact, deterministic — chosen so each rendered string is unambiguous) ──

/** analytics_kpis → 6 KPI cards. revenue→"KES 125,000", avg_booking_value→"KES 3,572". */
export const KPIS_POPULATED: AnalyticsKpis = {
  revenue: 125000,
  gross_bookings: 48,
  completed_bookings: 35,
  active_providers: 12,
  active_customers: 31,
  avg_booking_value: 3572,
};

/** analytics_bookings_summary → 5 cards. rates render with one decimal ("73.0%"). */
export const BOOKINGS_SUMMARY: BookingsSummary = {
  completion_rate: 73,
  cancellation_rate: 10,
  avg_completion_minutes: 47,
  pending: 5,
  completed: 35,
};

/** Same shape but avg_completion_minutes = null → the card renders "—" (malformed-safe). */
export const BOOKINGS_SUMMARY_NULL_COMPLETION: BookingsSummary = {
  ...BOOKINGS_SUMMARY,
  avg_completion_minutes: null,
};

export const FINANCIAL_SUMMARY: FinancialSummary = {
  revenue: 98000,
  provider_payouts: 68000,
  quickserve_revenue: 30000,
  wallet_used: 15000,
  promo_used: 4000,
};

export const CUSTOMERS: CustomerStats = {
  new_customers: 18,
  returning_customers: 13,
  repeat_booking_rate: 46,
  retention_rate: 42,
};

export const BOOKINGS_TS: BookingsPoint[] = [
  { period: '2026-07-01T00:00:00.000Z', total: 30, completed: 22, cancelled: 3 },
  { period: '2026-07-08T00:00:00.000Z', total: 45, completed: 33, cancelled: 4 },
];

export const FINANCIAL_TS: FinancialPoint[] = [
  { period: '2026-07-01T00:00:00.000Z', revenue: 40000, provider_payouts: 28000, quickserve_revenue: 12000, wallet_used: 6000, promo_used: 1500 },
  { period: '2026-07-08T00:00:00.000Z', revenue: 58000, provider_payouts: 40000, quickserve_revenue: 18000, wallet_used: 9000, promo_used: 2500 },
];

/**
 * Provider leaderboard (ordered by total_earnings desc, as the RPC returns).
 * Includes a null `full_name` (renders "#<id8>") and a null `avg_rating`
 * (excluded from the lowest-rated list) for the malformed-safe test.
 * Lowest-rated (avg_rating asc, nulls excluded): 3.1 (#33333333) < 4.2 (Brian) < 4.9 (Grace).
 */
export const PROVIDERS: ProviderStat[] = [
  { provider_id: '11111111-1111-4111-8111-111111111111', full_name: 'Grace Otieno', completed_jobs: 40, avg_rating: 4.9, total_earnings: 180000, completion_rate: 95 },
  { provider_id: '22222222-2222-4222-8222-222222222222', full_name: 'Brian Kamau', completed_jobs: 30, avg_rating: 4.2, total_earnings: 140000, completion_rate: 90 },
  { provider_id: '33333333-3333-4333-8333-333333333333', full_name: null, completed_jobs: 12, avg_rating: 3.1, total_earnings: 52000, completion_rate: 80 },
  { provider_id: '44444444-4444-4444-8444-444444444444', full_name: 'Nadia Farah', completed_jobs: 5, avg_rating: null, total_earnings: 20000, completion_rate: 70 },
];

export const SERVICES: ServiceStat[] = [
  { service_id: 'house-cleaning', bookings: 40, revenue: 160000, avg_job_value: 4000, cancellation_rate: 5 },
  { service_id: 'plumbing', bookings: 25, revenue: 90000, avg_job_value: 3600, cancellation_rate: 8 },
];

export const GEOGRAPHY: GeoStat[] = [
  { area: 'Nairobi', bookings: 70, revenue: 300000, active_providers: 8 },
  { area: 'Mombasa', bookings: 30, revenue: 120000, active_providers: 4 },
];

// ── Empty / zeroed fixtures (mirror the app's DEFAULT_* safe defaults) ──

export const ZERO_KPIS: AnalyticsKpis = {
  revenue: 0,
  gross_bookings: 0,
  completed_bookings: 0,
  active_providers: 0,
  active_customers: 0,
  avg_booking_value: 0,
};

export const ZERO_BOOKINGS_SUMMARY: BookingsSummary = {
  completion_rate: 0,
  cancellation_rate: 0,
  avg_completion_minutes: null,
  pending: 0,
  completed: 0,
};

export const ZERO_FINANCIAL_SUMMARY: FinancialSummary = {
  revenue: 0,
  provider_payouts: 0,
  quickserve_revenue: 0,
  wallet_used: 0,
  promo_used: 0,
};

export const ZERO_CUSTOMERS: CustomerStats = {
  new_customers: 0,
  returning_customers: 0,
  repeat_booking_rate: 0,
  retention_rate: 0,
};

// ── CSV fixtures for the export tests (Decision D: verify full deterministic output) ──

/**
 * A providers payload crafted to exercise every `toCsv` escaping rule in one file:
 *  - formula-injection guard: '=SUM(A1)' → leading single-quote
 *  - comma quoting: 'Otieno, Grace' → wrapped in double-quotes
 *  - embedded-quote doubling: 'O"Brien' → "O""Brien"
 */
export const PROVIDERS_CSV: ProviderStat[] = [
  { provider_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', full_name: '=SUM(A1)', completed_jobs: 10, avg_rating: 4, total_earnings: 50000, completion_rate: 90 },
  { provider_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', full_name: 'Otieno, Grace', completed_jobs: 8, avg_rating: 4.5, total_earnings: 40000, completion_rate: 88 },
  { provider_id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', full_name: 'O"Brien', completed_jobs: 6, avg_rating: 4.1, total_earnings: 30000, completion_rate: 85 },
];

/** Exact expected CSV for the Executive-KPIs "Download CSV" (single row). */
export const EXPECTED_KPIS_CSV = [
  'revenue,gross_bookings,completed_bookings,active_providers,active_customers,avg_booking_value',
  '125000,48,35,12,31,3572',
].join('\n');

/** Exact expected CSV for the Providers "Download CSV" using PROVIDERS_CSV. */
export const EXPECTED_PROVIDERS_CSV = [
  'provider_id,full_name,completed_jobs,avg_rating,total_earnings,completion_rate',
  "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa,'=SUM(A1),10,4,50000,90",
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb,"Otieno, Grace",8,4.5,40000,88',
  'cccccccc-cccc-4ccc-8ccc-cccccccccccc,"O""Brien",6,4.1,30000,85',
].join('\n');

// ── Options + tracker ────────────────────────────────────────────────────────

export type DetailedStubMode = 'populated' | 'empty';

export type DetailedStubOptions = {
  /** Global mode (default 'populated'). */
  mode?: DetailedStubMode;
  /** Delay every response by N ms (to observe the loading state). */
  delayMs?: number;
  /** RPCs that should FAIL at the network level (route.abort) regardless of mode. */
  failing?: DetailedRpc[];
  /** RPCs that should return empty/zeroed data even in 'populated' mode (partial-data). */
  emptyRpcs?: DetailedRpc[];
  /** Override the providers payload (used by the CSV export test). */
  providers?: ProviderStat[];
  /** Override the bookings-summary payload (used by the malformed-safe test). */
  bookingsSummary?: BookingsSummary;
};

/** Captured request parameters for a single RPC invocation. */
export type RpcParams = {
  p_from?: string;
  p_to?: string;
  p_bucket?: string;
  p_limit?: number;
};

export type DetailedAnalyticsTracker = {
  /** RPC names actually requested (in order; a name repeats once per re-fetch). */
  readonly called: string[];
  /** Analytics RPCs requested that were NOT in the known set. */
  readonly unexpected: string[];
  /** Requests that failed method/shape validation, with a diagnostic string. */
  readonly badShape: string[];
  /** Fails if any unexpected RPC or bad-shaped request occurred. */
  assertNoAnomalies(): void;
  /** Fails naming any RPC in `required` that was never requested. */
  assertCalled(required: readonly DetailedRpc[]): void;
  /** The most recent captured params for `rpc` (for filter assertions), or undefined. */
  lastParamsFor(rpc: DetailedRpc): RpcParams | undefined;
};

function jsonBody(rows: unknown): string {
  return JSON.stringify(rows);
}

async function respond(route: Route, rows: unknown, delayMs?: number): Promise<void> {
  if (delayMs && delayMs > 0) await new Promise((r) => setTimeout(r, delayMs));
  await route.fulfill({ status: 200, contentType: 'application/json', body: jsonBody(rows) });
}

async function respondError(route: Route, delayMs?: number): Promise<void> {
  // Abort at the network level. The app's wrappers convert this into safe
  // defaults (they never throw), so this drives graceful degradation.
  if (delayMs && delayMs > 0) await new Promise((r) => setTimeout(r, delayMs));
  await route.abort('failed');
}

/**
 * Install detailed-analytics RPC stubs on `page` and return a strict tracker.
 * Call BEFORE navigating. Register AFTER `installMockAdminSession` so these
 * specific analytics routes take priority over the mock's REST catch-all.
 */
export async function installDetailedAnalyticsStubs(
  page: Page,
  options: DetailedStubOptions = {},
): Promise<DetailedAnalyticsTracker> {
  const opts: DetailedStubOptions = { mode: 'populated', ...options };
  const failing = new Set(opts.failing ?? []);
  const forcedEmpty = new Set(opts.emptyRpcs ?? []);

  const called: string[] = [];
  const unexpected: string[] = [];
  const badShape: string[] = [];
  const paramsByRpc = new Map<string, RpcParams[]>();
  const known = new Set<string>(DETAILED_ANALYTICS_RPCS);

  function rpcNameFromUrl(url: string): string {
    return new URL(url).pathname.split('/rpc/')[1] ?? '';
  }

  // Catch-all — records any analytics RPC not covered by a specific handler.
  await page.route(/\/rest\/v1\/rpc\/analytics_/, async (route) => {
    const name = rpcNameFromUrl(route.request().url());
    if (!known.has(name)) unexpected.push(name);
    await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  });

  // Specific, validated handlers (registered later → higher priority).
  for (const rpc of DETAILED_ANALYTICS_RPCS) {
    await page.route(`**/rest/v1/rpc/${rpc}`, async (route) => {
      const req = route.request();
      called.push(rpc);

      // Capture + validate request shape.
      let body: RpcParams | null = null;
      try {
        body = req.postDataJSON() as RpcParams | null;
      } catch {
        body = null;
      }
      if (body) {
        const list = paramsByRpc.get(rpc) ?? [];
        list.push(body);
        paramsByRpc.set(rpc, list);
      }

      const problems: string[] = [];
      if (req.method() !== 'POST') problems.push(`method=${req.method()}`);
      if (!body || body.p_from === undefined || body.p_to === undefined) problems.push('missing p_from/p_to');
      if (BUCKETED_RPCS.has(rpc)) {
        const b = body?.p_bucket;
        if (b === undefined) problems.push('missing p_bucket');
        else if (b !== 'day' && b !== 'week' && b !== 'month') problems.push(`bad p_bucket=${b}`);
      }
      if (rpc === 'analytics_providers') {
        if (body?.p_limit === undefined) problems.push('missing p_limit');
        else if (typeof body.p_limit !== 'number') problems.push(`bad p_limit=${String(body.p_limit)}`);
      }
      if (problems.length > 0) {
        badShape.push(`${rpc} (${problems.join(', ')}; body=${JSON.stringify(body)})`);
      }

      if (failing.has(rpc)) {
        await respondError(route, opts.delayMs);
        return;
      }

      const empty = opts.mode === 'empty' || forcedEmpty.has(rpc);
      await respond(route, responseFor(rpc, empty, opts), opts.delayMs);
    });
  }

  return {
    called,
    unexpected,
    badShape,
    assertNoAnomalies() {
      if (unexpected.length > 0) {
        throw new Error(`Unexpected detailed-analytics RPC(s) requested: ${unexpected.join(', ')}`);
      }
      if (badShape.length > 0) {
        throw new Error(`Detailed-analytics request(s) failed method/shape validation:\n  - ${badShape.join('\n  - ')}`);
      }
    },
    assertCalled(required) {
      const missing = required.filter((r) => !called.includes(r));
      if (missing.length > 0) {
        throw new Error(`Expected detailed-analytics RPC(s) were never requested: ${missing.join(', ')}`);
      }
    },
    lastParamsFor(rpc) {
      const list = paramsByRpc.get(rpc);
      return list && list.length > 0 ? list[list.length - 1] : undefined;
    },
  };
}

/** Payload for a given RPC, honouring empty vs populated + per-RPC overrides. */
function responseFor(rpc: DetailedRpc, empty: boolean, opts: DetailedStubOptions): unknown {
  switch (rpc) {
    case 'analytics_kpis':
      return [empty ? ZERO_KPIS : KPIS_POPULATED];
    case 'analytics_bookings_timeseries':
      return empty ? [] : BOOKINGS_TS;
    case 'analytics_bookings_summary':
      return [empty ? ZERO_BOOKINGS_SUMMARY : opts.bookingsSummary ?? BOOKINGS_SUMMARY];
    case 'analytics_financial_timeseries':
      return empty ? [] : FINANCIAL_TS;
    case 'analytics_financial_summary':
      return [empty ? ZERO_FINANCIAL_SUMMARY : FINANCIAL_SUMMARY];
    case 'analytics_providers':
      return empty ? [] : opts.providers ?? PROVIDERS;
    case 'analytics_services':
      return empty ? [] : SERVICES;
    case 'analytics_geography':
      return empty ? [] : GEOGRAPHY;
    case 'analytics_customers':
      return [empty ? ZERO_CUSTOMERS : CUSTOMERS];
  }
}
