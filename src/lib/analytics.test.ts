import {
  getAnalyticsKpis,
  getAnalyticsBookingsTimeseries,
  getAnalyticsBookingsSummary,
  getAnalyticsFinancialTimeseries,
  getAnalyticsFinancialSummary,
  getAnalyticsProviders,
  getAnalyticsServices,
  getAnalyticsGeography,
  getAnalyticsCustomers,
  analyticsRange,
  toCsv,
} from '@/lib/analytics';

// ── Mock fns (prefixed with "mock" — Jest factory rule) ───────────────────

const mockRpc = jest.fn();

jest.mock('@/lib/supabase', () => ({
  supabase: {
    rpc: (...a: unknown[]) => mockRpc(...a),
  },
}));

beforeEach(() => {
  jest.clearAllMocks();
});

// ── Fixed reference date: local July 4 2026, 12:00:00 ──────────────────────
// new Date(2026, 6, 4, 12, 0, 0) — month is 0-indexed: 6 = July
const NOW = new Date(2026, 6, 4, 12, 0, 0);

// ── getAnalyticsKpis ───────────────────────────────────────────────────────

describe('getAnalyticsKpis', () => {
  it('calls analytics_kpis with p_from and p_to', async () => {
    const kpis = {
      revenue: 1000,
      gross_bookings: 50,
      completed_bookings: 40,
      active_providers: 10,
      active_customers: 30,
      avg_booking_value: 25,
    };
    mockRpc.mockResolvedValue({ data: [kpis], error: null });

    const result = await getAnalyticsKpis('2026-07-01T00:00:00.000Z', '2026-07-04T12:00:00.000Z');

    expect(mockRpc).toHaveBeenCalledWith('analytics_kpis', {
      p_from: '2026-07-01T00:00:00.000Z',
      p_to: '2026-07-04T12:00:00.000Z',
    });
    expect(result).toEqual(kpis);
  });

  it('returns zeroed default on error', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'Admin only' } });
    const result = await getAnalyticsKpis('2026-07-01T00:00:00.000Z', '2026-07-04T12:00:00.000Z');
    expect(result).toEqual({
      revenue: 0,
      gross_bookings: 0,
      completed_bookings: 0,
      active_providers: 0,
      active_customers: 0,
      avg_booking_value: 0,
    });
  });

  it('returns zeroed default when data is empty array', async () => {
    mockRpc.mockResolvedValue({ data: [], error: null });
    const result = await getAnalyticsKpis('from', 'to');
    expect(result).toEqual({
      revenue: 0,
      gross_bookings: 0,
      completed_bookings: 0,
      active_providers: 0,
      active_customers: 0,
      avg_booking_value: 0,
    });
  });
});

// ── getAnalyticsBookingsTimeseries ─────────────────────────────────────────

describe('getAnalyticsBookingsTimeseries', () => {
  it('calls analytics_bookings_timeseries with p_from, p_to, and p_bucket', async () => {
    const rows = [{ period: '2026-07-01T00:00:00.000Z', total: 10, completed: 8, cancelled: 2 }];
    mockRpc.mockResolvedValue({ data: rows, error: null });

    const result = await getAnalyticsBookingsTimeseries('from', 'to', 'day');

    expect(mockRpc).toHaveBeenCalledWith('analytics_bookings_timeseries', {
      p_from: 'from',
      p_to: 'to',
      p_bucket: 'day',
    });
    expect(result).toEqual(rows);
  });

  it('returns [] on error', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'err' } });
    expect(await getAnalyticsBookingsTimeseries('from', 'to', 'week')).toEqual([]);
  });

  it('returns [] when data is null', async () => {
    mockRpc.mockResolvedValue({ data: null, error: null });
    expect(await getAnalyticsBookingsTimeseries('from', 'to', 'month')).toEqual([]);
  });
});

// ── getAnalyticsBookingsSummary ────────────────────────────────────────────

describe('getAnalyticsBookingsSummary', () => {
  it('calls analytics_bookings_summary with p_from and p_to', async () => {
    const row = {
      completion_rate: 0.8,
      cancellation_rate: 0.1,
      avg_completion_minutes: 45,
      pending: 5,
      completed: 40,
    };
    mockRpc.mockResolvedValue({ data: [row], error: null });

    const result = await getAnalyticsBookingsSummary('from', 'to');

    expect(mockRpc).toHaveBeenCalledWith('analytics_bookings_summary', {
      p_from: 'from',
      p_to: 'to',
    });
    expect(result).toEqual(row);
  });

  it('returns zeroed default on error', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'err' } });
    expect(await getAnalyticsBookingsSummary('from', 'to')).toEqual({
      completion_rate: 0,
      cancellation_rate: 0,
      avg_completion_minutes: null,
      pending: 0,
      completed: 0,
    });
  });

  it('returns zeroed default when data is empty array', async () => {
    mockRpc.mockResolvedValue({ data: [], error: null });
    expect(await getAnalyticsBookingsSummary('from', 'to')).toEqual({
      completion_rate: 0,
      cancellation_rate: 0,
      avg_completion_minutes: null,
      pending: 0,
      completed: 0,
    });
  });
});

// ── getAnalyticsFinancialTimeseries ────────────────────────────────────────

describe('getAnalyticsFinancialTimeseries', () => {
  it('calls analytics_financial_timeseries with p_from, p_to, and p_bucket', async () => {
    const rows = [
      {
        period: '2026-07-01T00:00:00.000Z',
        revenue: 500,
        provider_payouts: 400,
        quickserve_revenue: 100,
        wallet_used: 50,
        promo_used: 20,
      },
    ];
    mockRpc.mockResolvedValue({ data: rows, error: null });

    const result = await getAnalyticsFinancialTimeseries('from', 'to', 'week');

    expect(mockRpc).toHaveBeenCalledWith('analytics_financial_timeseries', {
      p_from: 'from',
      p_to: 'to',
      p_bucket: 'week',
    });
    expect(result).toEqual(rows);
  });

  it('returns [] on error', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'err' } });
    expect(await getAnalyticsFinancialTimeseries('from', 'to', 'month')).toEqual([]);
  });

  it('returns [] when data is null', async () => {
    mockRpc.mockResolvedValue({ data: null, error: null });
    expect(await getAnalyticsFinancialTimeseries('from', 'to', 'day')).toEqual([]);
  });
});

// ── getAnalyticsFinancialSummary ───────────────────────────────────────────

describe('getAnalyticsFinancialSummary', () => {
  it('calls analytics_financial_summary with p_from and p_to', async () => {
    const row = {
      revenue: 1000,
      provider_payouts: 800,
      quickserve_revenue: 200,
      wallet_used: 100,
      promo_used: 50,
    };
    mockRpc.mockResolvedValue({ data: [row], error: null });

    const result = await getAnalyticsFinancialSummary('from', 'to');

    expect(mockRpc).toHaveBeenCalledWith('analytics_financial_summary', {
      p_from: 'from',
      p_to: 'to',
    });
    expect(result).toEqual(row);
  });

  it('returns zeroed default on error', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'err' } });
    expect(await getAnalyticsFinancialSummary('from', 'to')).toEqual({
      revenue: 0,
      provider_payouts: 0,
      quickserve_revenue: 0,
      wallet_used: 0,
      promo_used: 0,
    });
  });

  it('returns zeroed default when data is empty array', async () => {
    mockRpc.mockResolvedValue({ data: [], error: null });
    expect(await getAnalyticsFinancialSummary('from', 'to')).toEqual({
      revenue: 0,
      provider_payouts: 0,
      quickserve_revenue: 0,
      wallet_used: 0,
      promo_used: 0,
    });
  });
});

// ── getAnalyticsProviders ──────────────────────────────────────────────────

describe('getAnalyticsProviders', () => {
  it('calls analytics_providers with p_from, p_to, and p_limit (default 20)', async () => {
    const rows = [
      {
        provider_id: 'p1',
        full_name: 'Ali Hassan',
        completed_jobs: 30,
        avg_rating: 4.5,
        total_earnings: 1500,
        completion_rate: 0.9,
      },
    ];
    mockRpc.mockResolvedValue({ data: rows, error: null });

    const result = await getAnalyticsProviders('from', 'to');

    expect(mockRpc).toHaveBeenCalledWith('analytics_providers', {
      p_from: 'from',
      p_to: 'to',
      p_limit: 20,
    });
    expect(result).toEqual(rows);
  });

  it('passes custom limit', async () => {
    mockRpc.mockResolvedValue({ data: [], error: null });
    await getAnalyticsProviders('from', 'to', 10);
    expect(mockRpc).toHaveBeenCalledWith('analytics_providers', {
      p_from: 'from',
      p_to: 'to',
      p_limit: 10,
    });
  });

  it('returns [] on error', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'err' } });
    expect(await getAnalyticsProviders('from', 'to')).toEqual([]);
  });

  it('returns [] when data is null', async () => {
    mockRpc.mockResolvedValue({ data: null, error: null });
    expect(await getAnalyticsProviders('from', 'to')).toEqual([]);
  });
});

// ── getAnalyticsServices ───────────────────────────────────────────────────

describe('getAnalyticsServices', () => {
  it('calls analytics_services with p_from and p_to', async () => {
    const rows = [
      { service_id: 'cleaning', bookings: 20, revenue: 500, avg_job_value: 25, cancellation_rate: 0.05 },
    ];
    mockRpc.mockResolvedValue({ data: rows, error: null });

    const result = await getAnalyticsServices('from', 'to');

    expect(mockRpc).toHaveBeenCalledWith('analytics_services', { p_from: 'from', p_to: 'to' });
    expect(result).toEqual(rows);
  });

  it('returns [] on error', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'err' } });
    expect(await getAnalyticsServices('from', 'to')).toEqual([]);
  });

  it('returns [] when data is null', async () => {
    mockRpc.mockResolvedValue({ data: null, error: null });
    expect(await getAnalyticsServices('from', 'to')).toEqual([]);
  });
});

// ── getAnalyticsGeography ──────────────────────────────────────────────────

describe('getAnalyticsGeography', () => {
  it('calls analytics_geography with p_from and p_to', async () => {
    const rows = [{ area: 'Nairobi', bookings: 15, revenue: 400, active_providers: 5 }];
    mockRpc.mockResolvedValue({ data: rows, error: null });

    const result = await getAnalyticsGeography('from', 'to');

    expect(mockRpc).toHaveBeenCalledWith('analytics_geography', { p_from: 'from', p_to: 'to' });
    expect(result).toEqual(rows);
  });

  it('returns [] on error', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'err' } });
    expect(await getAnalyticsGeography('from', 'to')).toEqual([]);
  });

  it('returns [] when data is null', async () => {
    mockRpc.mockResolvedValue({ data: null, error: null });
    expect(await getAnalyticsGeography('from', 'to')).toEqual([]);
  });
});

// ── getAnalyticsCustomers ──────────────────────────────────────────────────

describe('getAnalyticsCustomers', () => {
  it('calls analytics_customers with p_from and p_to', async () => {
    const row = {
      new_customers: 10,
      returning_customers: 20,
      repeat_booking_rate: 0.4,
      retention_rate: 0.67,
    };
    mockRpc.mockResolvedValue({ data: [row], error: null });

    const result = await getAnalyticsCustomers('from', 'to');

    expect(mockRpc).toHaveBeenCalledWith('analytics_customers', { p_from: 'from', p_to: 'to' });
    expect(result).toEqual(row);
  });

  it('returns zeroed default on error', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'err' } });
    expect(await getAnalyticsCustomers('from', 'to')).toEqual({
      new_customers: 0,
      returning_customers: 0,
      repeat_booking_rate: 0,
      retention_rate: 0,
    });
  });

  it('returns zeroed default when data is empty array', async () => {
    mockRpc.mockResolvedValue({ data: [], error: null });
    expect(await getAnalyticsCustomers('from', 'to')).toEqual({
      new_customers: 0,
      returning_customers: 0,
      repeat_booking_rate: 0,
      retention_rate: 0,
    });
  });
});

// ── analyticsRange ─────────────────────────────────────────────────────────
// Fixed: NOW = new Date(2026, 6, 4, 12, 0, 0) = local July 4 2026, 12:00

describe('analyticsRange', () => {
  it('today: from = local midnight July 4, to = NOW', () => {
    const { from, to } = analyticsRange('today', undefined, undefined, NOW);
    expect(new Date(from).getDate()).toBe(4);
    expect(new Date(from).getMonth()).toBe(6); // July = 6
    expect(new Date(from).getHours()).toBe(0);
    expect(new Date(from).getMinutes()).toBe(0);
    expect(new Date(from).getSeconds()).toBe(0);
    expect(to).toBe(NOW.toISOString());
  });

  it('last7: from ≈ June 27 (7 days before July 4)', () => {
    const { from, to } = analyticsRange('last7', undefined, undefined, NOW);
    expect(new Date(from).getDate()).toBe(27);
    expect(new Date(from).getMonth()).toBe(5); // June = 5
    expect(to).toBe(NOW.toISOString());
  });

  it('last30: from ≈ June 4 (30 days before July 4)', () => {
    const { from, to } = analyticsRange('last30', undefined, undefined, NOW);
    expect(new Date(from).getDate()).toBe(4);
    expect(new Date(from).getMonth()).toBe(5); // June = 5
    expect(to).toBe(NOW.toISOString());
  });

  it('this_month: from = July 1 (local)', () => {
    const { from, to } = analyticsRange('this_month', undefined, undefined, NOW);
    expect(new Date(from).getDate()).toBe(1);
    expect(new Date(from).getMonth()).toBe(6); // July = 6
    expect(new Date(from).getHours()).toBe(0);
    expect(to).toBe(NOW.toISOString());
  });

  it('custom: uses provided customFrom and customTo', () => {
    const customFrom = '2026-06-01T00:00:00.000Z';
    const customTo = '2026-06-30T23:59:59.000Z';
    const { from, to } = analyticsRange('custom', customFrom, customTo, NOW);
    expect(from).toBe(customFrom);
    expect(to).toBe(customTo);
  });

  it('custom: falls back to local midnight when customFrom is undefined', () => {
    const customTo = '2026-07-04T12:00:00.000Z';
    const { from } = analyticsRange('custom', undefined, customTo, NOW);
    expect(new Date(from).getDate()).toBe(4);
    expect(new Date(from).getMonth()).toBe(6); // July = 6
    expect(new Date(from).getHours()).toBe(0);
  });

  it('custom: falls back to now when customTo is undefined', () => {
    const customFrom = '2026-07-01T00:00:00.000Z';
    const { to } = analyticsRange('custom', customFrom, undefined, NOW);
    expect(to).toBe(NOW.toISOString());
  });

  it('returns ISO strings', () => {
    const { from, to } = analyticsRange('last7', undefined, undefined, NOW);
    expect(typeof from).toBe('string');
    expect(typeof to).toBe('string');
    // Valid ISO format check
    expect(new Date(from).toISOString()).toBe(from);
    expect(new Date(to).toISOString()).toBe(to);
  });
});

// ── toCsv ──────────────────────────────────────────────────────────────────

describe('toCsv', () => {
  it('returns empty string for empty array', () => {
    expect(toCsv([])).toBe('');
  });

  it('header row uses keys of first row', () => {
    const csv = toCsv([{ name: 'Ali', age: 25 }]);
    const [header] = csv.split('\n');
    expect(header).toBe('name,age');
  });

  it('single row: header + data row', () => {
    const csv = toCsv([{ a: 1, b: 2 }]);
    expect(csv).toBe('a,b\n1,2');
  });

  it('multiple rows', () => {
    const csv = toCsv([
      { x: 'hello', y: 10 },
      { x: 'world', y: 20 },
    ]);
    expect(csv).toBe('x,y\nhello,10\nworld,20');
  });

  it('field with comma is quoted', () => {
    const csv = toCsv([{ value: 'hello, world' }]);
    expect(csv).toBe('value\n"hello, world"');
  });

  it('neutralises formula-injection (leading =,+,-,@) with a quote prefix', () => {
    // A malicious value starting with a formula trigger must not execute in Excel/Sheets.
    expect(toCsv([{ v: '=SUM(A1:A9)' }])).toBe("v\n'=SUM(A1:A9)");
    expect(toCsv([{ v: '+1' }])).toBe("v\n'+1");
    expect(toCsv([{ v: '-1+2' }])).toBe("v\n'-1+2");
    expect(toCsv([{ v: '@cmd' }])).toBe("v\n'@cmd");
    // A formula trigger PLUS a comma is both neutralised and quoted.
    expect(toCsv([{ v: '=A,B' }])).toBe('v\n"\'=A,B"');
    // Plain values are untouched.
    expect(toCsv([{ v: 'safe' }])).toBe('v\nsafe');
  });

  it('field with double-quote is quoted and internal quote doubled', () => {
    const csv = toCsv([{ value: 'say "hi"' }]);
    expect(csv).toBe('value\n"say ""hi"""');
  });

  it('field with newline is quoted', () => {
    const csv = toCsv([{ value: 'line1\nline2' }]);
    expect(csv).toBe('value\n"line1\nline2"');
  });

  it('field with carriage return is quoted', () => {
    const csv = toCsv([{ value: 'line1\rline2' }]);
    expect(csv).toBe('value\n"line1\rline2"');
  });

  it('null value → empty field', () => {
    const csv = toCsv([{ a: null, b: 'ok' }]);
    expect(csv).toBe('a,b\n,ok');
  });

  it('undefined value → empty field', () => {
    const csv = toCsv([{ a: undefined, b: 'ok' }]);
    expect(csv).toBe('a,b\n,ok');
  });

  it('header keys containing comma are also quoted (RFC-4180)', () => {
    const csv = toCsv([{ 'key,name': 'val' }]);
    const [header] = csv.split('\n');
    expect(header).toBe('"key,name"');
  });

  it('number values are serialized correctly', () => {
    const csv = toCsv([{ revenue: 1234.56, count: 0 }]);
    expect(csv).toBe('revenue,count\n1234.56,0');
  });
});
