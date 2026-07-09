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
