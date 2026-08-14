/**
 * src/app/(admin-web)/analytics/detailed.tsx — Web Admin Detailed Analytics Dashboard.
 *
 * This is the Slice-25 detailed analytics dashboard, relocated here to become a
 * drill-down from the new Executive Analytics landing screen (./index.tsx).
 * All logic is unchanged from the original index.tsx — only the function name
 * and PageMeta title have been updated.
 *
 * Read-only analytics dashboard for admins. Consumes the 9 analytics wrappers
 * from @/lib/analytics and renders charts/KPI cards for each section:
 *   - Executive KPIs
 *   - Booking analytics
 *   - Financial analytics
 *   - Provider analytics
 *   - Service analytics
 *   - Geographic analytics
 *   - Customer analytics
 *
 * Filter controls: preset date range + time-series bucket (day/week/month).
 * Each section has a "Download CSV" button that calls exportCsv().
 *
 * Wrapped by AdminShell via (admin-web)/_layout.tsx — returns only content.
 * Display-only — NO mutations, NO dispatch/ranking/payout influence.
 */

import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { PageMeta } from '@/components/admin-web/page-meta';
import { BarChart, type BarDatum } from '@/components/admin-web/charts/bar-chart';
import { LineChart, type SeriesPoint } from '@/components/admin-web/charts/line-chart';
import { PieChart, type PieSlice } from '@/components/admin-web/charts/pie-chart';
import { TrendCard } from '@/components/admin-web/charts/trend-card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Text } from '@/components/ui/text';
import { Spacing } from '@/constants/theme';
import { formatKes } from '@/lib/currency';
import { useServices } from '@/services/services-provider';
import {
  analyticsRange,
  exportCsv,
  getAnalyticsKpis,
  getAnalyticsBookingsTimeseries,
  getAnalyticsBookingsSummary,
  getAnalyticsFinancialTimeseries,
  getAnalyticsFinancialSummary,
  getAnalyticsProviders,
  getAnalyticsServices,
  getAnalyticsGeography,
  getAnalyticsCustomers,
  type AnalyticsBucket,
  type RangePreset,
  type AnalyticsKpis,
  type BookingsPoint,
  type BookingsSummary,
  type FinancialPoint,
  type FinancialSummary,
  type ProviderStat,
  type ServiceStat,
  type GeoStat,
  type CustomerStats,
} from '@/lib/analytics';

// ── Preset labels ─────────────────────────────────────────────────────────────

type PresetOption = { label: string; value: RangePreset };

const PRESETS: PresetOption[] = [
  { label: 'Today', value: 'today' },
  { label: 'Last 7 days', value: 'last7' },
  { label: 'Last 30 days', value: 'last30' },
  { label: 'This month', value: 'this_month' },
  { label: 'Custom', value: 'custom' },
];

type BucketOption = { label: string; value: AnalyticsBucket };

const BUCKETS: BucketOption[] = [
  { label: 'Day', value: 'day' },
  { label: 'Week', value: 'week' },
  { label: 'Month', value: 'month' },
];

// ── Section heading helper ────────────────────────────────────────────────────

function SectionHeading({
  title,
  onDownload,
}: {
  title: string;
  onDownload: () => void;
}) {
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: Spacing.three,
        marginTop: Spacing.five,
      }}>
      <Text variant="heading" color="text" weight="semibold">
        {title}
      </Text>
      <Button
        label="Download CSV"
        variant="ghost"
        size="md"
        onPress={onDownload}
      />
    </View>
  );
}

// ── Screen ────────────────────────────────────────────────────────────────────

export default function AnalyticsDetailedScreen() {
  const { getServiceBySlug } = useServices();
  // ── Filter state ───────────────────────────────────────────────────────────
  const [preset, setPreset] = useState<RangePreset>('last30');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [bucket, setBucket] = useState<AnalyticsBucket>('day');

  // ── Load / error state ─────────────────────────────────────────────────────
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // ── Dataset state ──────────────────────────────────────────────────────────
  const [kpis, setKpis] = useState<AnalyticsKpis>({
    revenue: 0,
    gross_bookings: 0,
    completed_bookings: 0,
    active_providers: 0,
    active_customers: 0,
    avg_booking_value: 0,
  });
  const [bookingsTs, setBookingsTs] = useState<BookingsPoint[]>([]);
  const [bookingsSummary, setBookingsSummary] = useState<BookingsSummary>({
    completion_rate: 0,
    cancellation_rate: 0,
    avg_completion_minutes: null,
    pending: 0,
    completed: 0,
  });
  const [financialTs, setFinancialTs] = useState<FinancialPoint[]>([]);
  const [financialSummary, setFinancialSummary] = useState<FinancialSummary>({
    revenue: 0,
    provider_payouts: 0,
    quickserve_revenue: 0,
    wallet_used: 0,
    promo_used: 0,
  });
  const [providers, setProviders] = useState<ProviderStat[]>([]);
  const [services, setServices] = useState<ServiceStat[]>([]);
  const [geography, setGeography] = useState<GeoStat[]>([]);
  const [customers, setCustomers] = useState<CustomerStats>({
    new_customers: 0,
    returning_customers: 0,
    repeat_booking_rate: 0,
    retention_rate: 0,
  });

  // ── Derived range ──────────────────────────────────────────────────────────
  const { from, to } = analyticsRange(preset, customFrom, customTo);

  // ── Load all data ──────────────────────────────────────────────────────────
  async function loadAll() {
    setLoading(true);
    setError('');
    try {
      const [
        kpisData,
        bookingsTsData,
        bookingsSummaryData,
        financialTsData,
        financialSummaryData,
        providersData,
        servicesData,
        geographyData,
        customersData,
      ] = await Promise.all([
        getAnalyticsKpis(from, to),
        getAnalyticsBookingsTimeseries(from, to, bucket),
        getAnalyticsBookingsSummary(from, to),
        getAnalyticsFinancialTimeseries(from, to, bucket),
        getAnalyticsFinancialSummary(from, to),
        getAnalyticsProviders(from, to),
        getAnalyticsServices(from, to),
        getAnalyticsGeography(from, to),
        getAnalyticsCustomers(from, to),
      ]);
      setKpis(kpisData);
      setBookingsTs(bookingsTsData);
      setBookingsSummary(bookingsSummaryData);
      setFinancialTs(financialTsData);
      setFinancialSummary(financialSummaryData);
      setProviders(providersData);
      setServices(servicesData);
      setGeography(geographyData);
      setCustomers(customersData);
    } catch {
      setError('Could not load analytics.');
    } finally {
      setLoading(false);
    }
  }

  // Re-load whenever filters change.
  useEffect(() => {
    void loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preset, bucket, customFrom, customTo]);

  // ── Derived chart data ─────────────────────────────────────────────────────

  /** Bookings timeseries → LineChart series */
  const bookingsLineSeries: SeriesPoint[] = bookingsTs.map((pt) => ({
    label: pt.period.slice(0, 10), // e.g. "2026-06-01"
    value: pt.total,
  }));

  /** Financial timeseries → LineChart series */
  const financialLineSeries: SeriesPoint[] = financialTs.map((pt) => ({
    label: pt.period.slice(0, 10),
    value: pt.revenue,
  }));

  /** Providers → BarChart data (top by total_earnings) */
  const providerBarData: BarDatum[] = providers.map((p) => ({
    label: p.full_name ?? `#${p.provider_id.slice(0, 6)}`,
    value: p.total_earnings,
  }));

  /** Lowest-rated providers (display-only, not for ranking/dispatch/payouts) */
  const lowestRated = [...providers]
    .filter((p) => p.avg_rating !== null)
    .sort((a, b) => (a.avg_rating ?? 0) - (b.avg_rating ?? 0))
    .slice(0, 5);

  /** Services → BarChart data (by bookings, with title lookup — display labels only) */
  const servicesBarData: BarDatum[] = services.map((s) => ({
    label: getServiceBySlug(s.service_id).title,
    value: s.bookings,
  }));

  /** Services → PieChart data (by revenue — display labels only) */
  const servicesPieSlices: PieSlice[] = services
    .filter((s) => s.revenue > 0)
    .map((s) => ({
      label: getServiceBySlug(s.service_id).title,
      value: s.revenue,
    }));

  /** Geography → BarChart data */
  const geoBarData: BarDatum[] = geography.map((g) => ({
    label: g.area,
    value: g.bookings,
  }));

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <>
      <PageMeta title="Detailed analytics" description="Business analytics dashboard for admins." />

      {/* ── Filter controls ──────────────────────────────────────────────── */}

      {/* Preset buttons */}
      <View
        style={{
          flexDirection: 'row',
          flexWrap: 'wrap',
          gap: Spacing.two,
          marginBottom: Spacing.two,
        }}>
        {PRESETS.map((p) => (
          <Button
            key={p.value}
            label={p.label}
            variant={preset === p.value ? 'primary' : 'secondary'}
            size="md"
            onPress={() => setPreset(p.value)}
          />
        ))}
      </View>

      {/* Custom date range inputs */}
      {preset === 'custom' && (
        <View
          style={{
            flexDirection: 'row',
            gap: Spacing.three,
            marginBottom: Spacing.two,
            flexWrap: 'wrap',
          }}>
          <View style={{ flex: 1, minWidth: 160 }}>
            <Input
              label="From (ISO date)"
              value={customFrom}
              onChangeText={setCustomFrom}
              placeholder="e.g. 2026-06-01"
            />
          </View>
          <View style={{ flex: 1, minWidth: 160 }}>
            <Input
              label="To (ISO date)"
              value={customTo}
              onChangeText={setCustomTo}
              placeholder="e.g. 2026-06-30"
            />
          </View>
        </View>
      )}

      {/* Bucket buttons */}
      <View
        style={{
          flexDirection: 'row',
          gap: Spacing.two,
          marginBottom: Spacing.four,
        }}>
        {BUCKETS.map((b) => (
          <Button
            key={b.value}
            label={b.label}
            variant={bucket === b.value ? 'primary' : 'secondary'}
            size="md"
            onPress={() => setBucket(b.value)}
          />
        ))}
      </View>

      {/* Global loading indicator */}
      {loading && (
        <Text variant="caption" color="textSecondary" style={{ marginBottom: Spacing.three }}>
          Loading analytics…
        </Text>
      )}

      {/* Global error state */}
      {error ? (
        <View style={{ marginBottom: Spacing.three, gap: Spacing.two }}>
          <Text variant="caption" color="error">
            {error}
          </Text>
          <Button label="Retry" variant="secondary" size="md" onPress={() => void loadAll()} />
        </View>
      ) : null}

      {/* ── Executive KPIs ─────────────────────────────────────────────── */}
      <SectionHeading
        title="Executive KPIs"
        onDownload={() =>
          void exportCsv('kpis.csv', [kpis as unknown as Record<string, unknown>])
        }
      />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.three, marginBottom: Spacing.three }}>
        <TrendCard
          title="Revenue"
          value={formatKes(kpis.revenue)}
          testID="kpi-revenue"
        />
        <TrendCard
          title="Gross Bookings"
          value={kpis.gross_bookings}
          testID="kpi-gross-bookings"
        />
        <TrendCard
          title="Completed Bookings"
          value={kpis.completed_bookings}
          testID="kpi-completed-bookings"
        />
        <TrendCard
          title="Active Providers"
          value={kpis.active_providers}
          testID="kpi-active-providers"
        />
        <TrendCard
          title="Active Customers"
          value={kpis.active_customers}
          testID="kpi-active-customers"
        />
        <TrendCard
          title="Avg Booking Value"
          value={formatKes(kpis.avg_booking_value)}
          testID="kpi-avg-booking-value"
        />
      </View>

      {/* ── Booking analytics ──────────────────────────────────────────── */}
      <SectionHeading
        title="Booking analytics"

        onDownload={() =>
          void exportCsv('bookings.csv', bookingsTs as unknown as Record<string, unknown>[])
        }
      />
      <LineChart
        series={bookingsLineSeries}
        loading={loading}
        testID="chart-bookings-ts"
      />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.three, marginTop: Spacing.three }}>
        <TrendCard
          title="Completion Rate"
          value={`${bookingsSummary.completion_rate.toFixed(1)}%`}
          testID="kpi-completion-rate"
        />
        <TrendCard
          title="Cancellation Rate"
          value={`${bookingsSummary.cancellation_rate.toFixed(1)}%`}
          testID="kpi-cancellation-rate"
        />
        <TrendCard
          title="Avg Completion (min)"
          value={
            bookingsSummary.avg_completion_minutes !== null
              ? bookingsSummary.avg_completion_minutes.toFixed(0)
              : null
          }
          testID="kpi-avg-completion"
        />
        <TrendCard
          title="Pending"
          value={bookingsSummary.pending}
          testID="kpi-pending"
        />
        <TrendCard
          title="Completed"
          value={bookingsSummary.completed}
          testID="kpi-completed"
        />
      </View>

      {/* ── Financial analytics ───────────────────────────────────────── */}
      <SectionHeading
        title="Financial analytics"

        onDownload={() =>
          void exportCsv('financial.csv', financialTs as unknown as Record<string, unknown>[])
        }
      />
      <LineChart
        series={financialLineSeries}
        format={formatKes}
        loading={loading}
        testID="chart-financial-ts"
      />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.three, marginTop: Spacing.three }}>
        <TrendCard
          title="Revenue"
          value={formatKes(financialSummary.revenue)}
          testID="kpi-fin-revenue"
        />
        <TrendCard
          title="Provider Payouts"
          value={formatKes(financialSummary.provider_payouts)}
          testID="kpi-fin-payouts"
        />
        <TrendCard
          title="KwikServe Revenue"
          value={formatKes(financialSummary.quickserve_revenue)}
          testID="kpi-fin-qs-revenue"
        />
        <TrendCard
          title="Wallet Used"
          value={formatKes(financialSummary.wallet_used)}
          testID="kpi-fin-wallet"
        />
        <TrendCard
          title="Promo Used"
          value={formatKes(financialSummary.promo_used)}
          testID="kpi-fin-promo"
        />
      </View>

      {/* ── Provider analytics ────────────────────────────────────────── */}
      <SectionHeading
        title="Provider analytics"

        onDownload={() =>
          void exportCsv('providers.csv', providers as unknown as Record<string, unknown>[])
        }
      />
      <Text variant="label" color="textSecondary" style={{ marginBottom: Spacing.two }}>
        Top providers by earnings (display-only)
      </Text>
      <BarChart
        data={providerBarData}
        format={formatKes}
        loading={loading}
        testID="chart-providers-bar"
      />

      {/* Lowest-rated list — display only */}
      {lowestRated.length > 0 && (
        <View style={{ marginTop: Spacing.three }}>
          <Text variant="label" color="textSecondary" style={{ marginBottom: Spacing.two }}>
            Lowest-rated providers (display-only — not used for dispatch or payouts)
          </Text>
          {lowestRated.map((p) => (
            <View
              key={p.provider_id}
              style={{
                flexDirection: 'row',
                justifyContent: 'space-between',
                paddingVertical: Spacing.one,
              }}>
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

      {/* ── Service analytics ─────────────────────────────────────────── */}
      <SectionHeading
        title="Service analytics"

        onDownload={() =>
          void exportCsv('services.csv', services as unknown as Record<string, unknown>[])
        }
      />
      <BarChart
        data={servicesBarData}
        loading={loading}
        testID="chart-services-bar"
      />
      {servicesPieSlices.length > 0 && (
        <View style={{ marginTop: Spacing.three }}>
          <Text variant="label" color="textSecondary" style={{ marginBottom: Spacing.two }}>
            Revenue by service
          </Text>
          <PieChart
            slices={servicesPieSlices}
            loading={loading}
            testID="chart-services-pie"
          />
        </View>
      )}

      {/* ── Geographic analytics ──────────────────────────────────────── */}
      <SectionHeading
        title="Geographic analytics"

        onDownload={() =>
          void exportCsv('geography.csv', geography as unknown as Record<string, unknown>[])
        }
      />
      <BarChart
        data={geoBarData}
        loading={loading}
        testID="chart-geography-bar"
      />

      {/* ── Customer analytics ────────────────────────────────────────── */}
      <SectionHeading
        title="Customer analytics"

        onDownload={() =>
          void exportCsv('customers.csv', [customers as unknown as Record<string, unknown>])
        }
      />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.three }}>
        <TrendCard
          title="New Customers"
          value={customers.new_customers}
          testID="kpi-new-customers"
        />
        <TrendCard
          title="Returning Customers"
          value={customers.returning_customers}
          testID="kpi-returning-customers"
        />
        <TrendCard
          title="Retention Rate"
          value={`${customers.retention_rate.toFixed(1)}%`}
          testID="kpi-retention-rate"
        />
        <TrendCard
          title="Repeat Booking Rate"
          value={`${customers.repeat_booking_rate.toFixed(1)}%`}
          testID="kpi-repeat-booking-rate"
        />
      </View>
    </>
  );
}
