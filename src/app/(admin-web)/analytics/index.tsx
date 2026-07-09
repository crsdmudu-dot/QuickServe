/**
 * (admin-web)/analytics/index.tsx — Executive Analytics Dashboard (landing).
 *
 * Aggregates platform-wide data via the Slice-38 executive-analytics wrappers
 * and the reused Slice-25 analytics wrappers. Display-only — no mutations, no
 * dispatch/ranking/payout influence, no AI. Admin-web only.
 *
 * Sections:
 *   1. Platform Health (snapshot KPIs)
 *   2. Activity – selected period
 *   3. Operational
 *   4. Growth (timeseries: customer + provider growth)
 *   5. Service analytics (categories + top services)
 *   6. Provider analytics (top earners / highest rated / most active)
 *   7. Geographic analytics
 *
 * Section-level loading: each dataset has its OWN loading flag. Sections render
 * independently as their data arrives — the whole page is never blocked on the
 * slowest call. KPI cards display their built-in skeleton while their section's
 * data is loading.
 *
 * Controls:
 *   - Range filter bar (Today / Last 7 / Last 30 / Last 90 / This year / Custom)
 *   - Last Updated timestamp
 *   - Refresh button (invalidates cache + reloads)
 *   - Drill-down button → /(admin-web)/analytics/detailed  (Slice-25 dashboard)
 *   - <!-- ExportMenu mount point — Task 5 -->
 *
 * Detailed Slice-25 analytics live at ./detailed.
 */

import { useEffect, useState, useCallback } from 'react';
import { StyleSheet, View } from 'react-native';
import { router, type Href } from 'expo-router';

import { PageMeta } from '@/components/admin-web/page-meta';
import { BarChart, type BarDatum } from '@/components/admin-web/charts/bar-chart';
import { LineChart, type SeriesPoint } from '@/components/admin-web/charts/line-chart';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { Spacing } from '@/constants/theme';
import { formatKes } from '@/lib/currency';
import { useServices } from '@/services/services-provider';
import { ExecutiveKpiCard } from '@/components/admin-web/analytics/executive-kpi-card';
import { MetricSection } from '@/components/admin-web/analytics/metric-section';
// <ExportMenu /> will be mounted here in Task 5 — see comment below in JSX

import {
  executiveRange,
  invalidateExecutiveCache,
  getOverviewTimestamp,
  getExecutiveOverview,
  getServiceCategories,
  getGrowthTimeseries,
  getNotificationDelivery,
  type ExecRangePreset,
  type ExecutiveOverview,
  type GrowthPoint,
  type ServiceCategoryStat,
  type NotificationDelivery,
} from '@/lib/executive-analytics';
import {
  getAnalyticsBookingsTimeseries,
  getAnalyticsFinancialTimeseries,
  getAnalyticsProviders,
  getAnalyticsServices,
  getAnalyticsGeography,
  type ProviderStat,
  type ServiceStat,
  type GeoStat,
  type BookingsPoint,
  type FinancialPoint,
} from '@/lib/analytics';

// ── Preset filter bar ─────────────────────────────────────────────────────────

const PRESETS: { id: ExecRangePreset; label: string }[] = [
  { id: 'today', label: 'Today' },
  { id: 'last7', label: 'Last 7 days' },
  { id: 'last30', label: 'Last 30 days' },
  { id: 'last90', label: 'Last 90 days' },
  { id: 'this_year', label: 'This year' },
  { id: 'custom', label: 'Custom' },
];

// ── Screen ────────────────────────────────────────────────────────────────────

export default function ExecutiveDashboard() {
  const { getServiceBySlug } = useServices();

  // ── Filter state ───────────────────────────────────────────────────────────
  const [preset, setPreset] = useState<ExecRangePreset>('last30');

  // ── Per-section loading flags (section-level loading, NOT page-level) ──────
  const [overviewLoading, setOverviewLoading] = useState(true);
  const [growthLoading, setGrowthLoading] = useState(true);
  const [categoriesLoading, setCategoriesLoading] = useState(true);
  const [providersLoading, setProvidersLoading] = useState(true);
  const [servicesLoading, setServicesLoading] = useState(true);
  const [geoLoading, setGeoLoading] = useState(true);
  const [bookingsTsLoading, setBookingsTsLoading] = useState(true);
  const [financialTsLoading, setFinancialTsLoading] = useState(true);
  const [notificationsLoading, setNotificationsLoading] = useState(true);

  // ── Last Updated timestamp ─────────────────────────────────────────────────
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);

  // ── Dataset state ──────────────────────────────────────────────────────────
  const [overview, setOverview] = useState<ExecutiveOverview | null>(null);
  const [growthTs, setGrowthTs] = useState<GrowthPoint[]>([]);
  const [categories, setCategories] = useState<ServiceCategoryStat[]>([]);
  const [providers, setProviders] = useState<ProviderStat[]>([]);
  const [services, setServices] = useState<ServiceStat[]>([]);
  const [geography, setGeography] = useState<GeoStat[]>([]);
  const [bookingsTs, setBookingsTs] = useState<BookingsPoint[]>([]);
  const [financialTs, setFinancialTs] = useState<FinancialPoint[]>([]);
  const [notifications, setNotifications] = useState<NotificationDelivery[]>([]);

  // ── Load — each dataset is independent; sections update as data arrives ────
  const load = useCallback(async () => {
    const { from, to } = executiveRange(preset);

    // Reset per-section loading flags (all loading again)
    setOverviewLoading(true);
    setGrowthLoading(true);
    setCategoriesLoading(true);
    setProvidersLoading(true);
    setServicesLoading(true);
    setGeoLoading(true);
    setBookingsTsLoading(true);
    setFinancialTsLoading(true);
    setNotificationsLoading(true);

    // Kick off all fetches in parallel — each resolves independently.
    // We use void + individual .then/.catch/.finally so sections update the
    // moment their own data arrives rather than waiting for the slowest call.

    void getExecutiveOverview(from, to)
      .then((data) => {
        setOverview(data);
        setLastUpdated(getOverviewTimestamp(from, to));
      })
      .finally(() => setOverviewLoading(false));

    void getGrowthTimeseries(from, to, 'day')
      .then(setGrowthTs)
      .finally(() => setGrowthLoading(false));

    void getServiceCategories(from, to)
      .then(setCategories)
      .finally(() => setCategoriesLoading(false));

    void getAnalyticsProviders(from, to)
      .then(setProviders)
      .finally(() => setProvidersLoading(false));

    void getAnalyticsServices(from, to)
      .then(setServices)
      .finally(() => setServicesLoading(false));

    void getAnalyticsGeography(from, to)
      .then(setGeography)
      .finally(() => setGeoLoading(false));

    void getAnalyticsBookingsTimeseries(from, to, 'day')
      .then(setBookingsTs)
      .finally(() => setBookingsTsLoading(false));

    void getAnalyticsFinancialTimeseries(from, to, 'day')
      .then(setFinancialTs)
      .finally(() => setFinancialTsLoading(false));

    void getNotificationDelivery(from, to)
      .then(setNotifications)
      .finally(() => setNotificationsLoading(false));
  }, [preset]);

  useEffect(() => {
    void load();
  }, [load]);

  // ── Refresh: clear cache then reload ─────────────────────────────────────
  const refresh = useCallback(() => {
    invalidateExecutiveCache();
    void load();
  }, [load]);

  // ── Derived chart series ───────────────────────────────────────────────────

  /** Customer growth → LineChart */
  const customerGrowthSeries: SeriesPoint[] = growthTs.map((pt) => ({
    label: pt.period.slice(0, 10),
    value: pt.new_customers,
  }));

  /** Provider growth → LineChart */
  const providerGrowthSeries: SeriesPoint[] = growthTs.map((pt) => ({
    label: pt.period.slice(0, 10),
    value: pt.new_providers,
  }));

  /** Bookings timeseries → LineChart */
  const bookingsLineSeries: SeriesPoint[] = bookingsTs.map((pt) => ({
    label: pt.period.slice(0, 10),
    value: pt.total,
  }));

  /** Revenue timeseries → LineChart */
  const revenueLineSeries: SeriesPoint[] = financialTs.map((pt) => ({
    label: pt.period.slice(0, 10),
    value: pt.revenue,
  }));

  /** Top services by bookings → BarChart (display-only) */
  const topServicesBarData: BarDatum[] = [...services]
    .sort((a, b) => b.bookings - a.bookings)
    .slice(0, 10)
    .map((s) => ({
      label: getServiceBySlug(s.service_id).title,
      value: s.bookings,
    }));

  /** Top services by revenue → BarChart (display-only) */
  const servicesRevenueBarData: BarDatum[] = [...services]
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 10)
    .map((s) => ({
      label: getServiceBySlug(s.service_id).title,
      value: s.revenue,
    }));

  /** Service categories → BarChart (display-only) */
  const categoriesBarData: BarDatum[] = categories.map((c) => ({
    label: c.category,
    value: c.bookings,
  }));

  /** Top providers by earnings → BarChart (display-only, no ranking influence) */
  const topProvidersByEarnings: BarDatum[] = [...providers]
    .sort((a, b) => b.total_earnings - a.total_earnings)
    .slice(0, 10)
    .map((p) => ({
      label: p.full_name ?? `#${p.provider_id.slice(0, 6)}`,
      value: p.total_earnings,
    }));

  /** Top providers by rating → list (display-only) */
  const topProvidersByRating = [...providers]
    .filter((p) => p.avg_rating !== null)
    .sort((a, b) => (b.avg_rating ?? 0) - (a.avg_rating ?? 0))
    .slice(0, 5);

  /** Top providers by jobs → list (display-only) */
  const topProvidersByJobs = [...providers]
    .sort((a, b) => b.completed_jobs - a.completed_jobs)
    .slice(0, 5);

  /** Geographic bookings → BarChart (display-only) */
  const geoBarData: BarDatum[] = [...geography]
    .sort((a, b) => b.bookings - a.bookings)
    .slice(0, 10)
    .map((g) => ({
      label: g.area,
      value: g.bookings,
    }));

  // ── Notification delivery stats ────────────────────────────────────────────
  const totalNotifications = notifications.reduce((sum, n) => sum + n.total, 0);

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <>
      <PageMeta title="Executive analytics" description="Executive overview of platform performance." />

      {/* ── Header: filter bar + controls ────────────────────────────────── */}
      <View style={styles.header}>
        {/* Range preset buttons */}
        <View style={styles.presets}>
          {PRESETS.map((p) => (
            <Button
              key={p.id}
              label={p.label}
              onPress={() => setPreset(p.id)}
              variant={p.id === preset ? 'primary' : 'secondary'}
              size="md"
            />
          ))}
        </View>

        {/* Right-side controls: last updated + refresh + export (Task 5) */}
        <View style={styles.headerRight}>
          <Text variant="caption" color="textSecondary">
            {lastUpdated
              ? `Last updated ${new Date(lastUpdated).toLocaleTimeString()}`
              : 'Last updated —'}
          </Text>
          <Button label="Refresh" onPress={refresh} variant="secondary" size="md" />
          {/* <ExportMenu /> — Task 5 mount point */}
        </View>

        {/* Drill-down to Slice-25 detailed dashboard */}
        <Button
          label="View detailed analytics"
          onPress={() => router.push('/(admin-web)/analytics/detailed' as Href)}
          variant="secondary"
          size="md"
        />
      </View>

      {/* ── 1. Platform Health ────────────────────────────────────────────── */}
      <MetricSection title="Platform Health">
        <ExecutiveKpiCard
          label="Current Wallet Balance"
          value={overview ? formatKes(overview.current_wallet_balance) : '—'}
          kind="snapshot"
          loading={overviewLoading}
        />
        <ExecutiveKpiCard
          label="Current Active Customers"
          value={overview ? String(overview.current_active_customers) : '—'}
          kind="snapshot"
          loading={overviewLoading}
        />
        <ExecutiveKpiCard
          label="Current Active Providers"
          value={overview ? String(overview.current_active_providers) : '—'}
          kind="snapshot"
          loading={overviewLoading}
        />
        <ExecutiveKpiCard
          label="Current Platform Rating"
          value={overview ? overview.current_platform_rating.toFixed(2) : '—'}
          kind="snapshot"
          loading={overviewLoading}
        />
        <ExecutiveKpiCard
          label="Active Disputes"
          value={overview ? String(overview.active_disputes) : '—'}
          kind="snapshot"
          loading={overviewLoading}
        />
        <ExecutiveKpiCard
          label="Open Support Tickets"
          value={overview ? String(overview.open_support_tickets) : '—'}
          kind="snapshot"
          loading={overviewLoading}
        />
      </MetricSection>

      {/* ── 2. Activity (selected period) ────────────────────────────────── */}
      <MetricSection title="Activity (selected period)">
        <ExecutiveKpiCard
          label="Total Bookings"
          value={overview ? String(overview.total_bookings) : '—'}
          kind="period"
          loading={overviewLoading}
        />
        <ExecutiveKpiCard
          label="Active Bookings"
          value={overview ? String(overview.active_bookings) : '—'}
          kind="period"
          loading={overviewLoading}
        />
        <ExecutiveKpiCard
          label="Completed Bookings"
          value={overview ? String(overview.completed_bookings) : '—'}
          kind="period"
          loading={overviewLoading}
        />
        <ExecutiveKpiCard
          label="Cancelled Bookings"
          value={overview ? String(overview.cancelled_bookings) : '—'}
          kind="period"
          loading={overviewLoading}
        />
        <ExecutiveKpiCard
          label="Total Revenue"
          value={overview ? formatKes(overview.total_revenue) : '—'}
          kind="period"
          loading={overviewLoading}
        />
        <ExecutiveKpiCard
          label="Platform Commission"
          value={overview ? formatKes(overview.platform_commission) : '—'}
          kind="period"
          loading={overviewLoading}
        />
        <ExecutiveKpiCard
          label="Average Booking Value"
          value={overview ? formatKes(overview.avg_booking_value) : '—'}
          kind="period"
          loading={overviewLoading}
        />
        <ExecutiveKpiCard
          label="Repeat Customer Rate"
          value={overview ? `${(overview.repeat_customer_rate * 100).toFixed(0)}%` : '—'}
          kind="period"
          loading={overviewLoading}
        />
        <ExecutiveKpiCard
          label="New Customers"
          value={overview ? String(overview.new_customers) : '—'}
          kind="period"
          loading={overviewLoading}
        />
        <ExecutiveKpiCard
          label="New Providers"
          value={overview ? String(overview.new_providers) : '—'}
          kind="period"
          loading={overviewLoading}
        />
        <ExecutiveKpiCard
          label="Period Avg Rating"
          value={overview ? overview.period_avg_rating.toFixed(2) : '—'}
          kind="period"
          loading={overviewLoading}
        />
      </MetricSection>

      {/* ── 3. Operational ───────────────────────────────────────────────── */}
      <MetricSection title="Operational">
        <ExecutiveKpiCard
          label="Pending Jobs"
          value={overview ? String(overview.pending_jobs) : '—'}
          kind="snapshot"
          loading={overviewLoading}
        />
        <ExecutiveKpiCard
          label="In-Progress Jobs"
          value={overview ? String(overview.in_progress_jobs) : '—'}
          kind="snapshot"
          loading={overviewLoading}
        />
        <ExecutiveKpiCard
          label="Avg Response Time"
          value={
            overviewLoading
              ? '—'
              : overview?.avg_response_minutes == null
                ? '—'
                : `${overview.avg_response_minutes.toFixed(0)} min`
          }
          kind="period"
          loading={overviewLoading}
        />
        <ExecutiveKpiCard
          label="Avg Completion Time"
          value={
            overviewLoading
              ? '—'
              : overview?.avg_completion_minutes == null
                ? '—'
                : `${overview.avg_completion_minutes.toFixed(0)} min`
          }
          kind="period"
          loading={overviewLoading}
        />
        <ExecutiveKpiCard
          label="Failed Payments"
          value={overview ? String(overview.failed_payments) : '—'}
          kind="period"
          loading={overviewLoading}
        />
        <ExecutiveKpiCard
          label="Notifications Sent"
          value={notificationsLoading ? '—' : String(totalNotifications)}
          kind="period"
          loading={notificationsLoading}
        />
      </MetricSection>

      {/* ── 4. Growth ────────────────────────────────────────────────────── */}
      <MetricSection title="Growth">
        <View style={styles.chartBlock}>
          <Text variant="label" color="textSecondary" style={styles.chartLabel}>
            Customer growth over time
          </Text>
          <LineChart
            series={customerGrowthSeries}
            loading={growthLoading}
            testID="chart-customer-growth"
          />
        </View>
        <View style={styles.chartBlock}>
          <Text variant="label" color="textSecondary" style={styles.chartLabel}>
            Provider growth over time
          </Text>
          <LineChart
            series={providerGrowthSeries}
            loading={growthLoading}
            testID="chart-provider-growth"
          />
        </View>
        <View style={styles.chartBlock}>
          <Text variant="label" color="textSecondary" style={styles.chartLabel}>
            Revenue over time
          </Text>
          <LineChart
            series={revenueLineSeries}
            format={formatKes}
            loading={financialTsLoading}
            testID="chart-revenue-ts"
          />
        </View>
        <View style={styles.chartBlock}>
          <Text variant="label" color="textSecondary" style={styles.chartLabel}>
            Bookings over time
          </Text>
          <LineChart
            series={bookingsLineSeries}
            loading={bookingsTsLoading}
            testID="chart-bookings-ts"
          />
        </View>
      </MetricSection>

      {/* ── 5. Service analytics ─────────────────────────────────────────── */}
      <MetricSection title="Service analytics">
        <View style={styles.chartBlock}>
          <Text variant="label" color="textSecondary" style={styles.chartLabel}>
            Top services by bookings (display-only)
          </Text>
          <BarChart
            data={topServicesBarData}
            loading={servicesLoading}
            testID="chart-top-services-bar"
          />
        </View>
        <View style={styles.chartBlock}>
          <Text variant="label" color="textSecondary" style={styles.chartLabel}>
            Top services by revenue (display-only)
          </Text>
          <BarChart
            data={servicesRevenueBarData}
            format={formatKes}
            loading={servicesLoading}
            testID="chart-services-revenue-bar"
          />
        </View>
        {categories.length > 0 && (
          <View style={styles.chartBlock}>
            <Text variant="label" color="textSecondary" style={styles.chartLabel}>
              Bookings by category (display-only)
            </Text>
            <BarChart
              data={categoriesBarData}
              loading={categoriesLoading}
              testID="chart-categories-bar"
            />
          </View>
        )}
      </MetricSection>

      {/* ── 6. Provider analytics ─────────────────────────────────────────── */}
      <MetricSection title="Provider analytics">
        <View style={styles.chartBlock}>
          <Text variant="label" color="textSecondary" style={styles.chartLabel}>
            Top providers by earnings (display-only — no ranking influence)
          </Text>
          <BarChart
            data={topProvidersByEarnings}
            format={formatKes}
            loading={providersLoading}
            testID="chart-top-providers-earnings"
          />
        </View>

        {/* Highest-rated providers — display-only list */}
        {!providersLoading && topProvidersByRating.length > 0 && (
          <View style={styles.listBlock}>
            <Text variant="label" color="textSecondary" style={styles.chartLabel}>
              Highest-rated providers (display-only)
            </Text>
            {topProvidersByRating.map((p) => (
              <View key={p.provider_id} style={styles.listRow}>
                <Text variant="caption" color="text">
                  {p.full_name ?? `#${p.provider_id.slice(0, 8)}`}
                </Text>
                <Text variant="caption" color="textSecondary">
                  {p.avg_rating !== null ? `${p.avg_rating.toFixed(1)} ★` : '—'}
                </Text>
              </View>
            ))}
          </View>
        )}

        {/* Most active providers (by completed jobs) — display-only list */}
        {!providersLoading && topProvidersByJobs.length > 0 && (
          <View style={styles.listBlock}>
            <Text variant="label" color="textSecondary" style={styles.chartLabel}>
              Most active providers by completed jobs (display-only)
            </Text>
            {topProvidersByJobs.map((p) => (
              <View key={p.provider_id} style={styles.listRow}>
                <Text variant="caption" color="text">
                  {p.full_name ?? `#${p.provider_id.slice(0, 8)}`}
                </Text>
                <Text variant="caption" color="textSecondary">
                  {p.completed_jobs} jobs
                </Text>
              </View>
            ))}
          </View>
        )}
      </MetricSection>

      {/* ── 7. Geographic analytics ───────────────────────────────────────── */}
      <MetricSection title="Geographic analytics">
        <View style={styles.chartBlock}>
          <Text variant="label" color="textSecondary" style={styles.chartLabel}>
            Top areas by bookings (display-only)
          </Text>
          <BarChart
            data={geoBarData}
            loading={geoLoading}
            testID="chart-geography-bar"
          />
        </View>
      </MetricSection>
    </>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  header: {
    gap: Spacing.two,
    marginBottom: Spacing.four,
  },
  presets: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.one,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    flexWrap: 'wrap',
  },
  chartBlock: {
    width: '100%',
    gap: Spacing.one,
  },
  chartLabel: {
    marginBottom: Spacing.one,
  },
  listBlock: {
    width: '100%',
    gap: Spacing.one,
  },
  listRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: Spacing.one,
  },
});
