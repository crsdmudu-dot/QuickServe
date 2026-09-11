/**
 * Tests for the web-admin analytics dashboard screen:
 *   - src/app/(admin-web)/analytics/index.tsx
 *
 * Verifies:
 *   - All section headings and a KPI value render after data loads.
 *   - Changing the preset (press "Today") re-calls the analytics wrappers.
 *   - Pressing a section "Download CSV" button calls exportCsv.
 *
 * All network calls are mocked. Chart components are stubbed to avoid
 * react-native-svg in jsdom. Uses findBy* / waitFor for async loads.
 */

// Mock ServicesProvider — analytics screen uses useServices() for getServiceBySlug (label lookup)
jest.mock('@/services/services-provider', () => {
  const { mockServicesProviderModule } = require('../../test/mock-services');
  return mockServicesProviderModule();
});

// ── Chart component stubs (avoid react-native-svg in jsdom) ──────────────────

jest.mock('@/components/admin-web/charts/trend-card', () => ({
  TrendCard: ({ title, value, subtitle, testID }: { title: string; value: string | number | null; subtitle?: string; testID?: string }) => {
    const { View, Text } = require('react-native');
    return (
      <View testID={testID ?? 'trend-card'}>
        <Text>{title}</Text>
        <Text>{value ?? '—'}</Text>
        {subtitle ? <Text>{subtitle}</Text> : null}
      </View>
    );
  },
}));

jest.mock('@/components/admin-web/charts/bar-chart', () => ({
  BarChart: ({ testID, data }: { testID?: string; data: Array<{ label: string; value: number }> }) => {
    const { View, Text } = require('react-native');
    return (
      <View testID={testID ?? 'bar-chart'}>
        {(data ?? []).map((d: { label: string; value: number }, i: number) => (
          <View key={i}>
            <Text>{d.label}</Text>
            <Text testID={`${testID ?? 'bar-chart'}-value-${i}`}>{String(d.value)}</Text>
          </View>
        ))}
      </View>
    );
  },
}));

jest.mock('@/components/admin-web/charts/line-chart', () => ({
  LineChart: ({ testID, series }: { testID?: string; series: Array<{ label: string; value: number }> }) => {
    const { View, Text } = require('react-native');
    return (
      <View testID={testID ?? 'line-chart'}>
        {(series ?? []).map((s: { label: string; value: number }, i: number) => (
          <Text key={i}>{s.label}</Text>
        ))}
      </View>
    );
  },
}));

jest.mock('@/components/admin-web/charts/pie-chart', () => ({
  PieChart: ({ testID, slices }: { testID?: string; slices: Array<{ label: string; value: number }> }) => {
    const { View, Text } = require('react-native');
    return (
      <View testID={testID ?? 'pie-chart'}>
        {(slices ?? []).map((s: { label: string; value: number }, i: number) => (
          <Text key={i}>{s.label}</Text>
        ))}
      </View>
    );
  },
}));

// ── Analytics lib mocks ───────────────────────────────────────────────────────

const mockExportCsv = jest.fn().mockResolvedValue(undefined);

const mockGetAnalyticsKpis = jest.fn();
const mockGetAnalyticsBookingsTimeseries = jest.fn();
const mockGetAnalyticsBookingsSummary = jest.fn();
const mockGetAnalyticsFinancialTimeseries = jest.fn();
const mockGetAnalyticsFinancialSummary = jest.fn();
const mockGetAnalyticsProviders = jest.fn();
const mockGetAnalyticsServices = jest.fn();
const mockGetAnalyticsGeography = jest.fn();
const mockGetAnalyticsCustomers = jest.fn();
const mockAnalyticsRange = jest.fn().mockReturnValue({ from: 'F', to: 'T' });

jest.mock('@/lib/analytics', () => ({
  getAnalyticsKpis: (...args: unknown[]) => mockGetAnalyticsKpis(...args),
  getAnalyticsBookingsTimeseries: (...args: unknown[]) =>
    mockGetAnalyticsBookingsTimeseries(...args),
  getAnalyticsBookingsSummary: (...args: unknown[]) =>
    mockGetAnalyticsBookingsSummary(...args),
  getAnalyticsFinancialTimeseries: (...args: unknown[]) =>
    mockGetAnalyticsFinancialTimeseries(...args),
  getAnalyticsFinancialSummary: (...args: unknown[]) =>
    mockGetAnalyticsFinancialSummary(...args),
  getAnalyticsProviders: (...args: unknown[]) => mockGetAnalyticsProviders(...args),
  getAnalyticsServices: (...args: unknown[]) => mockGetAnalyticsServices(...args),
  getAnalyticsGeography: (...args: unknown[]) => mockGetAnalyticsGeography(...args),
  getAnalyticsCustomers: (...args: unknown[]) => mockGetAnalyticsCustomers(...args),
  analyticsRange: (...args: unknown[]) => mockAnalyticsRange(...args),
  exportCsv: (...args: unknown[]) => mockExportCsv(...args),
}));

// ── Imports ───────────────────────────────────────────────────────────────────

import { fireEvent, render, screen, waitFor, within } from '@testing-library/react-native';
import AdminWebAnalyticsScreen from '@/app/(admin-web)/analytics/detailed';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const MOCK_KPIS = {
  revenue: 150000,
  gross_bookings: 42,
  completed_bookings: 38,
  active_providers: 12,
  active_customers: 30,
  avg_booking_value: 3571,
};

const MOCK_BOOKINGS_TS = [
  { period: '2026-06-01', total: 10, completed: 9, cancelled: 1 },
  { period: '2026-06-02', total: 8, completed: 7, cancelled: 1 },
];

const MOCK_BOOKINGS_SUMMARY = {
  completion_rate: 90.5,
  cancellation_rate: 9.5,
  avg_completion_minutes: 75,
  pending: 4,
  completed: 38,
};

const MOCK_FINANCIAL_TS = [
  { period: '2026-06-01', revenue: 50000, provider_payouts: 40000, quickserve_revenue: 10000, wallet_used: 5000, promo_used: 1000, provider_payouts_disbursed: 20000 },
];

// provider_payouts is the LEGACY gross-entitlement figure (0025). The tile must show the 0052
// disbursement figure instead, and the outstanding liability as a current snapshot.
const MOCK_FINANCIAL_SUMMARY = {
  revenue: 999000,
  provider_payouts: 120000,
  quickserve_revenue: 30000,
  wallet_used: 12000,
  promo_used: 3000,
  provider_payouts_disbursed: 45000,
  provider_outstanding_liability: 75000,
};

const MOCK_PROVIDERS = [
  { provider_id: 'prov-aaaa-1111', full_name: 'John Kamau', completed_jobs: 20, avg_rating: 4.8, total_earnings: 80000, completion_rate: 95 },
  { provider_id: 'prov-bbbb-2222', full_name: 'Mary Njoki', completed_jobs: 15, avg_rating: 3.2, total_earnings: 60000, completion_rate: 85 },
];

const MOCK_SERVICES = [
  { service_id: 'house-cleaning', bookings: 25, revenue: 37500, avg_job_value: 1500, cancellation_rate: 5 },
  { service_id: 'plumbing', bookings: 17, revenue: 34000, avg_job_value: 2000, cancellation_rate: 8 },
];

const MOCK_GEOGRAPHY = [
  { area: 'Nairobi CBD', bookings: 30, revenue: 60000, active_providers: 8 },
  { area: 'Westlands', bookings: 12, revenue: 24000, active_providers: 4 },
];

const MOCK_CUSTOMERS = {
  new_customers: 18,
  returning_customers: 12,
  repeat_booking_rate: 28.5,
  retention_rate: 62.0,
};

// ── Setup ─────────────────────────────────────────────────────────────────────

function setupMocks() {
  mockGetAnalyticsKpis.mockResolvedValue(MOCK_KPIS);
  mockGetAnalyticsBookingsTimeseries.mockResolvedValue(MOCK_BOOKINGS_TS);
  mockGetAnalyticsBookingsSummary.mockResolvedValue(MOCK_BOOKINGS_SUMMARY);
  mockGetAnalyticsFinancialTimeseries.mockResolvedValue(MOCK_FINANCIAL_TS);
  mockGetAnalyticsFinancialSummary.mockResolvedValue(MOCK_FINANCIAL_SUMMARY);
  mockGetAnalyticsProviders.mockResolvedValue(MOCK_PROVIDERS);
  mockGetAnalyticsServices.mockResolvedValue(MOCK_SERVICES);
  mockGetAnalyticsGeography.mockResolvedValue(MOCK_GEOGRAPHY);
  mockGetAnalyticsCustomers.mockResolvedValue(MOCK_CUSTOMERS);
  mockAnalyticsRange.mockReturnValue({ from: 'F', to: 'T' });
  mockExportCsv.mockResolvedValue(undefined);
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('AdminWebAnalyticsScreen (analytics dashboard)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setupMocks();
  });

  // ── KPI values render ───────────────────────────────────────────────────────

  it('renders the revenue KPI value after data loads', async () => {
    render(<AdminWebAnalyticsScreen />);
    // revenue = 150000 → formatKes(150000) = "KES 150,000"
    expect(await screen.findByText('KES 150,000')).toBeOnTheScreen();
  });

  it('renders the gross_bookings KPI value after data loads', async () => {
    render(<AdminWebAnalyticsScreen />);
    await screen.findByText('KES 150,000');
    // gross_bookings = 42 rendered by TrendCard as text
    expect(screen.getByText('42')).toBeOnTheScreen();
  });

  // ── Section headings render ─────────────────────────────────────────────────

  it('renders the Executive KPIs section heading', async () => {
    render(<AdminWebAnalyticsScreen />);
    await screen.findByText('KES 150,000');
    expect(screen.getByText('Executive KPIs')).toBeOnTheScreen();
  });

  it('renders the Booking analytics section heading', async () => {
    render(<AdminWebAnalyticsScreen />);
    await screen.findByText('KES 150,000');
    expect(screen.getByText('Booking analytics')).toBeOnTheScreen();
  });

  it('renders the Financial analytics section heading', async () => {
    render(<AdminWebAnalyticsScreen />);
    await screen.findByText('KES 150,000');
    expect(screen.getByText('Financial analytics')).toBeOnTheScreen();
  });

  it('renders the Provider analytics section heading', async () => {
    render(<AdminWebAnalyticsScreen />);
    await screen.findByText('KES 150,000');
    expect(screen.getByText('Provider analytics')).toBeOnTheScreen();
  });

  it('renders the Service analytics section heading', async () => {
    render(<AdminWebAnalyticsScreen />);
    await screen.findByText('KES 150,000');
    expect(screen.getByText('Service analytics')).toBeOnTheScreen();
  });

  it('renders the Geographic analytics section heading', async () => {
    render(<AdminWebAnalyticsScreen />);
    await screen.findByText('KES 150,000');
    expect(screen.getByText('Geographic analytics')).toBeOnTheScreen();
  });

  it('renders the Customer analytics section heading', async () => {
    render(<AdminWebAnalyticsScreen />);
    await screen.findByText('KES 150,000');
    expect(screen.getByText('Customer analytics')).toBeOnTheScreen();
  });

  // ── Preset change re-calls wrappers ────────────────────────────────────────

  it('pressing "Today" re-calls analyticsRange and the analytics wrappers with new range', async () => {
    render(<AdminWebAnalyticsScreen />);
    await screen.findByText('KES 150,000');

    const initialKpiCallCount = mockGetAnalyticsKpis.mock.calls.length;

    // Change the preset to "Today"
    mockAnalyticsRange.mockReturnValue({ from: 'TODAY-FROM', to: 'TODAY-TO' });
    fireEvent.press(screen.getByText('Today'));

    await waitFor(() =>
      expect(mockGetAnalyticsKpis.mock.calls.length).toBeGreaterThan(initialKpiCallCount),
    );

    // analyticsRange should have been called with 'today'
    expect(mockAnalyticsRange).toHaveBeenCalledWith(
      'today',
      expect.any(String),
      expect.any(String),
    );
  });

  // ── Provider payouts = real disbursements; outstanding = current snapshot (0052) ──────

  it('labels the payouts tile as disbursed and shows the disbursement figure, not gross entitlement', async () => {
    render(<AdminWebAnalyticsScreen />);
    expect(await screen.findByText('Provider payouts (disbursed)')).toBeOnTheScreen();
    expect(within(screen.getByTestId('kpi-fin-payouts')).getByText('KES 45,000')).toBeOnTheScreen();
    expect(screen.queryByText('Provider Payouts')).toBeNull();
    // The legacy gross-entitlement number must not be presented anywhere on the page.
    expect(screen.queryByText('KES 120,000')).toBeNull();
  });

  it('shows outstanding liability to providers as an explicitly current snapshot', async () => {
    render(<AdminWebAnalyticsScreen />);
    expect(await screen.findByText('Outstanding to providers')).toBeOnTheScreen();
    const tile = within(screen.getByTestId('kpi-fin-outstanding'));
    expect(tile.getByText('KES 75,000')).toBeOnTheScreen();
    expect(tile.getByText(/current/i)).toBeOnTheScreen();
  });

  it('shows KES 0 disbursed alongside a positive outstanding balance when nothing has been paid yet', async () => {
    mockGetAnalyticsFinancialSummary.mockResolvedValue({
      ...MOCK_FINANCIAL_SUMMARY,
      provider_payouts: 120000, // large accrued entitlement in the window
      provider_payouts_disbursed: 0,
      provider_outstanding_liability: 120000,
    });
    render(<AdminWebAnalyticsScreen />);
    await screen.findByText('Provider payouts (disbursed)');
    expect(within(screen.getByTestId('kpi-fin-payouts')).getByText('KES 0')).toBeOnTheScreen();
    expect(within(screen.getByTestId('kpi-fin-outstanding')).getByText('KES 120,000')).toBeOnTheScreen();
  });

  it('exports ONE financial CSV: period rows plus a window-total row, explicit headings, never the ambiguous legacy one', async () => {
    // One click must yield one download: browsers may block a second programmatic download
    // from the same gesture, so the window totals and the current outstanding liability ride
    // in the same file as a final `window_total` row sharing the same column set.
    render(<AdminWebAnalyticsScreen />);
    await screen.findByText('KES 150,000');

    const csvButtons = screen.getAllByText('Download CSV');
    fireEvent.press(csvButtons[2]); // Financial analytics = index 2

    await waitFor(() =>
      expect(mockExportCsv).toHaveBeenCalledWith('financial.csv', expect.any(Array)),
    );
    const financialCalls = mockExportCsv.mock.calls.filter((c) => c[0] === 'financial.csv');
    expect(financialCalls).toHaveLength(1);
    expect(mockExportCsv).toHaveBeenCalledTimes(1);

    const rows = financialCalls[0][1] as Record<string, unknown>[];
    expect(rows).toHaveLength(2);
    const [periodRow, totalRow] = rows;

    // Every row shares one header set (toCsv derives headers from the first row).
    expect(Object.keys(totalRow)).toEqual(Object.keys(periodRow));
    for (const r of rows) {
      expect(r).not.toHaveProperty('provider_payouts');
      expect(r).toHaveProperty('provider_entitlement_gross_legacy');
    }

    expect(periodRow.row_type).toBe('period');
    expect(periodRow.period).toBe('2026-06-01');
    expect(periodRow.provider_payouts_disbursed).toBe(20000);
    expect(periodRow.provider_entitlement_gross_legacy).toBe(40000);
    expect(periodRow.provider_outstanding_liability_current).toBe('');

    expect(totalRow.row_type).toBe('window_total');
    expect(totalRow.provider_payouts_disbursed).toBe(45000);
    expect(totalRow.provider_entitlement_gross_legacy).toBe(120000);
    expect(totalRow.provider_outstanding_liability_current).toBe(75000);
    expect(totalRow.revenue).toBe(999000);
  });

  // ── Download CSV calls exportCsv ───────────────────────────────────────────

  it('pressing "Download CSV" on Executive KPIs calls exportCsv with kpis.csv', async () => {
    render(<AdminWebAnalyticsScreen />);
    await screen.findByText('KES 150,000');

    // There are multiple "Download CSV" buttons — get the first one (Executive KPIs section)
    const csvButtons = screen.getAllByText('Download CSV');
    fireEvent.press(csvButtons[0]);

    await waitFor(() =>
      expect(mockExportCsv).toHaveBeenCalledWith('kpis.csv', expect.any(Array)),
    );
  });

  it('pressing "Download CSV" on Booking analytics calls exportCsv with bookings.csv', async () => {
    render(<AdminWebAnalyticsScreen />);
    await screen.findByText('KES 150,000');

    const csvButtons = screen.getAllByText('Download CSV');
    fireEvent.press(csvButtons[1]); // Booking analytics = index 1

    await waitFor(() =>
      expect(mockExportCsv).toHaveBeenCalledWith('bookings.csv', expect.any(Array)),
    );
  });

  it('pressing "Download CSV" on Provider analytics calls exportCsv with providers.csv', async () => {
    render(<AdminWebAnalyticsScreen />);
    await screen.findByText('KES 150,000');

    const csvButtons = screen.getAllByText('Download CSV');
    fireEvent.press(csvButtons[3]); // Provider analytics = index 3

    await waitFor(() =>
      expect(mockExportCsv).toHaveBeenCalledWith('providers.csv', expect.any(Array)),
    );
  });

  // ── Top providers = GROSS entitlement (sum(provider_earnings.amount)), named as such ────

  it('titles the top-providers chart by gross entitlement, never "earnings"', async () => {
    render(<AdminWebAnalyticsScreen />);
    expect(await screen.findByText(/^Top providers by gross entitlement/)).toBeOnTheScreen();
    expect(screen.queryByText(/Top providers by earnings/)).toBeNull();
  });

  it('keeps the chart values and ranking exactly as the RPC returns total_earnings', async () => {
    render(<AdminWebAnalyticsScreen />);
    await screen.findByTestId('chart-providers-bar-value-0');
    // Order and values are the RPC's (ordered by total_earnings desc) — untouched by the rename.
    expect(screen.getByTestId('chart-providers-bar-value-0')).toHaveTextContent('80000');
    expect(screen.getByTestId('chart-providers-bar-value-1')).toHaveTextContent('60000');
  });

  it('ranks by gross entitlement, not net payable, disbursed or outstanding', async () => {
    // gross 10,000; deductions 2,000; disbursed 3,000; outstanding 5,000 — the chart must use 10,000.
    mockGetAnalyticsProviders.mockResolvedValueOnce([
      { provider_id: 'prov-gross-0001', full_name: 'Gross Test', completed_jobs: 1, avg_rating: 4.0, total_earnings: 10000, completion_rate: 100 },
    ]);
    mockGetAnalyticsFinancialSummary.mockResolvedValueOnce({
      ...MOCK_FINANCIAL_SUMMARY,
      provider_payouts: 10000,
      provider_payouts_disbursed: 3000,
      provider_outstanding_liability: 5000,
    });
    render(<AdminWebAnalyticsScreen />);
    await screen.findByTestId('chart-providers-bar-value-0');
    expect(screen.getByTestId('chart-providers-bar-value-0')).toHaveTextContent('10000');
    for (const wrong of ['8000', '5000', '3000']) {
      expect(screen.getByTestId('chart-providers-bar-value-0')).not.toHaveTextContent(wrong);
    }
  });

  it('exports providers.csv with the gross-entitlement value under an explicit heading', async () => {
    render(<AdminWebAnalyticsScreen />);
    await screen.findByText('KES 150,000');
    fireEvent.press(screen.getAllByText('Download CSV')[3]);
    await waitFor(() =>
      expect(mockExportCsv).toHaveBeenCalledWith('providers.csv', expect.any(Array)),
    );
    const call = mockExportCsv.mock.calls.find((c) => c[0] === 'providers.csv') as [string, Record<string, unknown>[]];
    const rows = call[1];
    expect(rows).toHaveLength(2);
    expect(Object.keys(rows[0])).toEqual([
      'provider_id', 'full_name', 'completed_jobs', 'avg_rating', 'provider_entitlement_gross', 'completion_rate',
    ]);
    expect(rows[0].provider_entitlement_gross).toBe(80000);
    expect(rows[1].provider_entitlement_gross).toBe(60000);
    for (const r of rows) {
      for (const k of Object.keys(r)) {
        expect(k).not.toMatch(/earnings|payout/i);
      }
    }
  });

  // ── Bucket change re-calls wrappers ────────────────────────────────────────

  it('pressing "Week" bucket re-calls the timeseries wrappers', async () => {
    render(<AdminWebAnalyticsScreen />);
    await screen.findByText('KES 150,000');

    const initialCount = mockGetAnalyticsBookingsTimeseries.mock.calls.length;

    fireEvent.press(screen.getByText('Week'));

    await waitFor(() =>
      expect(mockGetAnalyticsBookingsTimeseries.mock.calls.length).toBeGreaterThan(initialCount),
    );
  });

  // ── Chart data rendered via stubs ──────────────────────────────────────────

  it('renders provider names in the provider bar chart stub', async () => {
    render(<AdminWebAnalyticsScreen />);
    await screen.findByText('KES 150,000');
    // John Kamau may appear in both the bar chart stub and lowest-rated list
    const johnElements = screen.getAllByText('John Kamau');
    expect(johnElements.length).toBeGreaterThanOrEqual(1);
    expect(johnElements[0]).toBeOnTheScreen();
  });

  it('renders area names in the geography bar chart stub', async () => {
    render(<AdminWebAnalyticsScreen />);
    await screen.findByText('KES 150,000');
    expect(screen.getByText('Nairobi CBD')).toBeOnTheScreen();
  });

  // ── Customer KPIs render ────────────────────────────────────────────────────

  it('renders the new customers count', async () => {
    render(<AdminWebAnalyticsScreen />);
    await screen.findByText('KES 150,000');
    expect(screen.getByText('18')).toBeOnTheScreen();
  });
});
