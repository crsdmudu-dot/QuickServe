/**
 * executive-dashboard.test.tsx
 *
 * TDD tests for the Executive Analytics Dashboard (Task 4, Slice 38).
 * Verifies:
 *   - Platform Health section heading renders after data loads.
 *   - "Current Wallet Balance" KPI card renders.
 *   - "Total Bookings" KPI card renders.
 *   - "Last updated" timestamp renders.
 *   - Section-level loading: kpi-skeleton testIDs present before data resolves,
 *     values render after resolve.
 *
 * All network calls are mocked. Chart components are stubbed to avoid
 * react-native-svg in jsdom.
 */

// ── Chart component stubs ─────────────────────────────────────────────────────

jest.mock('@/components/admin-web/charts/line-chart', () => ({
  LineChart: ({ testID }: { testID?: string }) => {
    const { View } = require('react-native');
    return <View testID={testID ?? 'line-chart'} />;
  },
}));

jest.mock('@/components/admin-web/charts/bar-chart', () => ({
  BarChart: ({ testID }: { testID?: string }) => {
    const { View } = require('react-native');
    return <View testID={testID ?? 'bar-chart'} />;
  },
}));

jest.mock('@/components/admin-web/charts/pie-chart', () => ({
  PieChart: ({ testID }: { testID?: string }) => {
    const { View } = require('react-native');
    return <View testID={testID ?? 'pie-chart'} />;
  },
}));

jest.mock('@/components/admin-web/charts/trend-card', () => ({
  TrendCard: ({ title, testID }: { title: string; testID?: string }) => {
    const { View, Text } = require('react-native');
    return (
      <View testID={testID ?? 'trend-card'}>
        <Text>{title}</Text>
      </View>
    );
  },
}));

// ── Skeleton stub ─────────────────────────────────────────────────────────────

jest.mock('@/components/ui/skeleton', () => ({
  Skeleton: ({ testID }: { testID?: string }) => {
    const { View } = require('react-native');
    return <View testID={testID ?? 'skeleton'} />;
  },
}));

// ── expo-router mock ──────────────────────────────────────────────────────────

jest.mock('expo-router', () => ({
  router: { push: jest.fn() },
}));

// ── ServicesProvider mock ─────────────────────────────────────────────────────

jest.mock('@/services/services-provider', () => ({
  useServices: () => ({
    getServiceBySlug: (slug: string) => ({ title: slug, slug }),
  }),
}));

// ── executive-analytics lib mock ──────────────────────────────────────────────

jest.mock('@/lib/executive-analytics', () => ({
  executiveRange: () => ({ from: 'F', to: 'T' }),
  invalidateExecutiveCache: jest.fn(),
  getOverviewTimestamp: () => Date.parse('2026-07-09T12:00:00Z'),
  getExecutiveOverview: jest.fn().mockResolvedValue({
    current_wallet_balance: 5000,
    current_active_customers: 12,
    current_active_providers: 4,
    current_platform_rating: 4.6,
    active_disputes: 1,
    open_support_tickets: 2,
    pending_jobs: 3,
    in_progress_jobs: 2,
    total_bookings: 40,
    active_bookings: 10,
    completed_bookings: 25,
    cancelled_bookings: 5,
    total_revenue: 90000,
    platform_commission: 9000,
    avg_booking_value: 3600,
    repeat_customer_rate: 0.3,
    new_customers: 8,
    new_providers: 2,
    avg_response_minutes: 12,
    avg_completion_minutes: 90,
    failed_payments: 1,
    period_avg_rating: 4.5,
  }),
  getServiceCategories: jest.fn().mockResolvedValue([]),
  getGrowthTimeseries: jest.fn().mockResolvedValue([]),
  getNotificationDelivery: jest.fn().mockResolvedValue([]),
}));

// ── analytics lib mock ────────────────────────────────────────────────────────

jest.mock('@/lib/analytics', () => ({
  getAnalyticsBookingsTimeseries: jest.fn().mockResolvedValue([]),
  getAnalyticsFinancialTimeseries: jest.fn().mockResolvedValue([]),
  getAnalyticsProviders: jest.fn().mockResolvedValue([]),
  getAnalyticsServices: jest.fn().mockResolvedValue([]),
  getAnalyticsGeography: jest.fn().mockResolvedValue([]),
}));

// ── Imports ───────────────────────────────────────────────────────────────────

import { render, screen, waitFor } from '@testing-library/react-native';
import ExecutiveDashboard from '@/app/(admin-web)/analytics/index';

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('ExecutiveDashboard (executive analytics landing)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Restore the default mock implementations after each clearAllMocks().
    // clearAllMocks resets call history but NOT mock implementations set via
    // jest.mock(), so the factory defaults apply automatically here.
  });

  test('renders health snapshot + activity KPIs and Last Updated', async () => {
    render(<ExecutiveDashboard />);
    await waitFor(() => expect(screen.getByText('Platform Health')).toBeOnTheScreen());
    expect(screen.getByText('Current Wallet Balance')).toBeOnTheScreen();
    expect(screen.getByText('Total Bookings')).toBeOnTheScreen();
    expect(screen.getByText(/Last updated/i)).toBeOnTheScreen();
  });

  test('shows kpi-skeleton testIDs while data is loading, then values render', async () => {
    // Use a deferred promise so we can check the loading state before it resolves
    let resolveOverview!: (v: unknown) => void;
    const overviewPromise = new Promise((res) => {
      resolveOverview = res;
    });

    const { getExecutiveOverview } = require('@/lib/executive-analytics');
    (getExecutiveOverview as jest.Mock).mockReturnValueOnce(overviewPromise);

    render(<ExecutiveDashboard />);

    // While loading: skeleton placeholders should be present
    await waitFor(() => {
      const skeletons = screen.queryAllByTestId('kpi-skeleton');
      expect(skeletons.length).toBeGreaterThan(0);
    });

    // Resolve the data
    resolveOverview({
      current_wallet_balance: 5000,
      current_active_customers: 12,
      current_active_providers: 4,
      current_platform_rating: 4.6,
      active_disputes: 1,
      open_support_tickets: 2,
      pending_jobs: 3,
      in_progress_jobs: 2,
      total_bookings: 40,
      active_bookings: 10,
      completed_bookings: 25,
      cancelled_bookings: 5,
      total_revenue: 90000,
      platform_commission: 9000,
      avg_booking_value: 3600,
      repeat_customer_rate: 0.3,
      new_customers: 8,
      new_providers: 2,
      avg_response_minutes: 12,
      avg_completion_minutes: 90,
      failed_payments: 1,
      period_avg_rating: 4.5,
    });

    // After resolve: section heading and KPI labels render
    await waitFor(() => expect(screen.getByText('Platform Health')).toBeOnTheScreen());
    expect(screen.getByText('Current Wallet Balance')).toBeOnTheScreen();
    expect(screen.getByText('Total Bookings')).toBeOnTheScreen();
  });
});

// ── Task 5: Per-section error state tests ─────────────────────────────────────
// These tests verify that when ONE wrapper rejects, only that section shows its
// inline error + Retry. Other sections remain fully functional (their data loads).

describe('ExecutiveDashboard per-section error states (Task 5)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('getExecutiveOverview reject → Platform Health inline error + Retry; Growth section still renders', async () => {
    // Make overview reject once — simulates supabase.rpc throwing (not a query error)
    const { getExecutiveOverview } = require('@/lib/executive-analytics');
    (getExecutiveOverview as jest.Mock).mockRejectedValueOnce(new Error('network'));

    render(<ExecutiveDashboard />);

    // Platform Health section: inline error + Retry button
    await waitFor(() =>
      expect(screen.getByText(/could not load platform health data/i)).toBeOnTheScreen(),
    );
    // Retry buttons render (one per section that shares overviewError)
    const retryButtons = screen.getAllByText('Retry');
    expect(retryButtons.length).toBeGreaterThan(0);

    // Growth section still renders its heading — its data was NOT the one that failed
    expect(screen.getByText('Growth')).toBeOnTheScreen();
    // Geographic analytics also still renders
    expect(screen.getByText('Geographic analytics')).toBeOnTheScreen();
  });

  test('getAnalyticsGeography reject → geo inline error; Platform Health section still renders its KPI cards', async () => {
    // Make geography reject once; everything else resolves normally
    const { getAnalyticsGeography } = require('@/lib/analytics');
    (getAnalyticsGeography as jest.Mock).mockRejectedValueOnce(new Error('geo fail'));

    render(<ExecutiveDashboard />);

    // Geographic analytics section: inline error + at least one Retry
    await waitFor(() =>
      expect(screen.getByText(/could not load geographic analytics/i)).toBeOnTheScreen(),
    );
    expect(screen.getAllByText('Retry').length).toBeGreaterThan(0);

    // Platform Health section renders normally (overview resolved fine)
    expect(screen.getByText('Platform Health')).toBeOnTheScreen();
    expect(screen.getByText('Current Wallet Balance')).toBeOnTheScreen();
  });

  test('Refresh re-invokes getExecutiveOverview after an error', async () => {
    const { getExecutiveOverview, invalidateExecutiveCache } =
      require('@/lib/executive-analytics');
    (getExecutiveOverview as jest.Mock).mockRejectedValueOnce(new Error('network'));

    const { fireEvent } = require('@testing-library/react-native');
    render(<ExecutiveDashboard />);

    // Wait for error to appear
    await waitFor(() =>
      expect(screen.getByText(/could not load platform health data/i)).toBeOnTheScreen(),
    );

    // Press Refresh
    fireEvent.press(screen.getAllByText('Refresh')[0]);

    // invalidateExecutiveCache + getExecutiveOverview called again
    await waitFor(() => {
      expect(invalidateExecutiveCache).toHaveBeenCalled();
      expect((getExecutiveOverview as jest.Mock).mock.calls.length).toBeGreaterThanOrEqual(2);
    });
  });
});
