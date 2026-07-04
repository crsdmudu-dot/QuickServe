// analytics.ts — Read-only admin analytics client lib.
// Wraps the 9 analytics RPCs, provides analyticsRange (pure), toCsv (pure), and exportCsv.
// No new dependencies. Mirror style of reviews.ts (supabase helpers) + scheduling.ts (injected-now).
import { Platform, Share } from 'react-native';
import { supabase } from '@/lib/supabase';

// ── Types ──────────────────────────────────────────────────────────────────

/** Time bucket used for timeseries RPCs. */
export type AnalyticsBucket = 'day' | 'week' | 'month';

/** Preset date range options for the analytics dashboard. */
export type RangePreset = 'today' | 'last7' | 'last30' | 'this_month' | 'custom';

/** KPI summary row — returned by analytics_kpis. */
export type AnalyticsKpis = {
  revenue: number;
  gross_bookings: number;
  completed_bookings: number;
  active_providers: number;
  active_customers: number;
  avg_booking_value: number;
};

/** A single point in the bookings timeseries — analytics_bookings_timeseries. */
export type BookingsPoint = {
  period: string;
  total: number;
  completed: number;
  cancelled: number;
};

/** Bookings summary row — analytics_bookings_summary. */
export type BookingsSummary = {
  completion_rate: number;
  cancellation_rate: number;
  avg_completion_minutes: number | null;
  pending: number;
  completed: number;
};

/** A single point in the financial timeseries — analytics_financial_timeseries. */
export type FinancialPoint = {
  period: string;
  revenue: number;
  provider_payouts: number;
  quickserve_revenue: number;
  wallet_used: number;
  promo_used: number;
};

/** Financial summary row — analytics_financial_summary. */
export type FinancialSummary = {
  revenue: number;
  provider_payouts: number;
  quickserve_revenue: number;
  wallet_used: number;
  promo_used: number;
};

/** A row from the provider leaderboard — analytics_providers. */
export type ProviderStat = {
  provider_id: string;
  full_name: string | null;
  completed_jobs: number;
  avg_rating: number | null;
  total_earnings: number;
  completion_rate: number;
};

/** A row from the services breakdown — analytics_services. */
export type ServiceStat = {
  service_id: string;
  bookings: number;
  revenue: number;
  avg_job_value: number;
  cancellation_rate: number;
};

/** A row from the geography breakdown — analytics_geography. */
export type GeoStat = {
  area: string;
  bookings: number;
  revenue: number;
  active_providers: number;
};

/** Customer stats row — analytics_customers. */
export type CustomerStats = {
  new_customers: number;
  returning_customers: number;
  repeat_booking_rate: number;
  retention_rate: number;
};

// ── Safe defaults (returned on error) ─────────────────────────────────────

const DEFAULT_KPIS: AnalyticsKpis = {
  revenue: 0,
  gross_bookings: 0,
  completed_bookings: 0,
  active_providers: 0,
  active_customers: 0,
  avg_booking_value: 0,
};

const DEFAULT_BOOKINGS_SUMMARY: BookingsSummary = {
  completion_rate: 0,
  cancellation_rate: 0,
  avg_completion_minutes: null,
  pending: 0,
  completed: 0,
};

const DEFAULT_FINANCIAL_SUMMARY: FinancialSummary = {
  revenue: 0,
  provider_payouts: 0,
  quickserve_revenue: 0,
  wallet_used: 0,
  promo_used: 0,
};

const DEFAULT_CUSTOMER_STATS: CustomerStats = {
  new_customers: 0,
  returning_customers: 0,
  repeat_booking_rate: 0,
  retention_rate: 0,
};

// ── RPC Wrappers ───────────────────────────────────────────────────────────

/**
 * Returns KPI summary for a date range.
 * Calls analytics_kpis RPC. Returns zeroed defaults on error.
 */
export async function getAnalyticsKpis(from: string, to: string): Promise<AnalyticsKpis> {
  const { data, error } = await supabase.rpc('analytics_kpis', { p_from: from, p_to: to });
  if (error) return DEFAULT_KPIS;
  return (data as AnalyticsKpis[] | null)?.[0] ?? DEFAULT_KPIS;
}

/**
 * Returns booking counts bucketed by day/week/month.
 * Calls analytics_bookings_timeseries RPC. Returns [] on error.
 */
export async function getAnalyticsBookingsTimeseries(
  from: string,
  to: string,
  bucket: AnalyticsBucket,
): Promise<BookingsPoint[]> {
  const { data, error } = await supabase.rpc('analytics_bookings_timeseries', {
    p_from: from,
    p_to: to,
    p_bucket: bucket,
  });
  if (error) return [];
  return (data as BookingsPoint[] | null) ?? [];
}

/**
 * Returns booking completion/cancellation summary for a date range.
 * Calls analytics_bookings_summary RPC. Returns zeroed defaults on error.
 */
export async function getAnalyticsBookingsSummary(
  from: string,
  to: string,
): Promise<BookingsSummary> {
  const { data, error } = await supabase.rpc('analytics_bookings_summary', {
    p_from: from,
    p_to: to,
  });
  if (error) return DEFAULT_BOOKINGS_SUMMARY;
  return (data as BookingsSummary[] | null)?.[0] ?? DEFAULT_BOOKINGS_SUMMARY;
}

/**
 * Returns financial metrics bucketed by day/week/month.
 * Calls analytics_financial_timeseries RPC. Returns [] on error.
 */
export async function getAnalyticsFinancialTimeseries(
  from: string,
  to: string,
  bucket: AnalyticsBucket,
): Promise<FinancialPoint[]> {
  const { data, error } = await supabase.rpc('analytics_financial_timeseries', {
    p_from: from,
    p_to: to,
    p_bucket: bucket,
  });
  if (error) return [];
  return (data as FinancialPoint[] | null) ?? [];
}

/**
 * Returns financial summary totals for a date range.
 * Calls analytics_financial_summary RPC. Returns zeroed defaults on error.
 */
export async function getAnalyticsFinancialSummary(
  from: string,
  to: string,
): Promise<FinancialSummary> {
  const { data, error } = await supabase.rpc('analytics_financial_summary', {
    p_from: from,
    p_to: to,
  });
  if (error) return DEFAULT_FINANCIAL_SUMMARY;
  return (data as FinancialSummary[] | null)?.[0] ?? DEFAULT_FINANCIAL_SUMMARY;
}

/**
 * Returns the provider leaderboard for a date range.
 * Calls analytics_providers RPC. Returns [] on error.
 */
export async function getAnalyticsProviders(
  from: string,
  to: string,
  limit = 20,
): Promise<ProviderStat[]> {
  const { data, error } = await supabase.rpc('analytics_providers', {
    p_from: from,
    p_to: to,
    p_limit: limit,
  });
  if (error) return [];
  return (data as ProviderStat[] | null) ?? [];
}

/**
 * Returns per-service analytics for a date range.
 * Calls analytics_services RPC. Returns [] on error.
 */
export async function getAnalyticsServices(from: string, to: string): Promise<ServiceStat[]> {
  const { data, error } = await supabase.rpc('analytics_services', { p_from: from, p_to: to });
  if (error) return [];
  return (data as ServiceStat[] | null) ?? [];
}

/**
 * Returns geographic breakdown of bookings for a date range.
 * Calls analytics_geography RPC. Returns [] on error.
 */
export async function getAnalyticsGeography(from: string, to: string): Promise<GeoStat[]> {
  const { data, error } = await supabase.rpc('analytics_geography', { p_from: from, p_to: to });
  if (error) return [];
  return (data as GeoStat[] | null) ?? [];
}

/**
 * Returns customer acquisition/retention stats for a date range.
 * Calls analytics_customers RPC. Returns zeroed defaults on error.
 */
export async function getAnalyticsCustomers(from: string, to: string): Promise<CustomerStats> {
  const { data, error } = await supabase.rpc('analytics_customers', { p_from: from, p_to: to });
  if (error) return DEFAULT_CUSTOMER_STATS;
  return (data as CustomerStats[] | null)?.[0] ?? DEFAULT_CUSTOMER_STATS;
}

// ── analyticsRange ─────────────────────────────────────────────────────────

/**
 * Pure helper: returns `{ from, to }` ISO strings for a date range preset.
 * Inject `now` for deterministic tests.
 *
 * Presets:
 * - `today`      — from = local midnight of `now`; to = `now`
 * - `last7`      — from = `now` − 7 days; to = `now`
 * - `last30`     — from = `now` − 30 days; to = `now`
 * - `this_month` — from = local first-of-month of `now`; to = `now`
 * - `custom`     — from = `customFrom` (fallback: local midnight); to = `customTo` (fallback: `now`)
 */
export function analyticsRange(
  preset: RangePreset,
  customFrom?: string,
  customTo?: string,
  now: Date = new Date(),
): { from: string; to: string } {
  const to = now.toISOString();

  switch (preset) {
    case 'today': {
      const from = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
      return { from, to };
    }
    case 'last7': {
      const d = new Date(now);
      d.setDate(d.getDate() - 7);
      return { from: d.toISOString(), to };
    }
    case 'last30': {
      const d = new Date(now);
      d.setDate(d.getDate() - 30);
      return { from: d.toISOString(), to };
    }
    case 'this_month': {
      const from = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
      return { from, to };
    }
    case 'custom': {
      const fallbackFrom = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
      return {
        from: customFrom ?? fallbackFrom,
        to: customTo ?? to,
      };
    }
  }
}

// ── CSV helpers ────────────────────────────────────────────────────────────

/**
 * Pure helper: converts an array of rows to a RFC-4180 CSV string.
 * - Returns `''` when rows is empty.
 * - First row keys become the header.
 * - Fields are quoted and internal `"` are doubled when the field contains `,`, `"`, `\n`, or `\r`.
 * - `null`/`undefined` values are written as empty fields.
 */
export function toCsv(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return '';

  const headers = Object.keys(rows[0]);

  function escapeField(value: unknown): string {
    if (value === null || value === undefined) return '';
    let str = String(value);
    // CSV formula-injection guard (CWE-1236): a leading =,+,-,@,tab or CR can be
    // executed as a formula by Excel/Sheets when the admin opens the export.
    // Neutralise by prefixing a single quote so the cell is treated as text.
    if (/^[=+\-@\t\r]/.test(str)) str = "'" + str;
    // RFC-4180: wrap in double quotes when field contains comma, double-quote, newline, or CR
    if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
      return '"' + str.replace(/"/g, '""') + '"';
    }
    return str;
  }

  const lines: string[] = [headers.map(escapeField).join(',')];
  for (const row of rows) {
    lines.push(headers.map((h) => escapeField(row[h])).join(','));
  }
  return lines.join('\n');
}

/**
 * Best-effort CSV export — never throws.
 * - Web (`Platform.OS === 'web'`): creates a Blob, object URL, and triggers `<a download>` click.
 * - Native: uses `Share.share({ message: csv })` from react-native.
 */
export async function exportCsv(filename: string, rows: Record<string, unknown>[]): Promise<void> {
  try {
    const csv = toCsv(rows);
    if (Platform.OS === 'web') {
      if (typeof document !== 'undefined') {
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
      }
    } else {
      await Share.share({ message: csv });
    }
  } catch {
    // Best-effort: swallow errors — never throws to caller
  }
}

/**
 * Future-ready: PDF export is planned for a later slice. Not implemented — no dependency added.
 */
export async function exportPdf(_filename: string, _rows: Record<string, unknown>[]): Promise<void> {
  console.warn('PDF export coming soon');
}
