/**
 * src/app/(admin-web)/index.tsx — Admin Dashboard
 *
 * Read-only summary view. Loads four counters on mount using existing lib
 * helpers (no new RPC/RLS):
 *   - getAllBookings        → total bookings count
 *   - adminGetAllPayments  → total & paid count + total KES received
 *   - getPendingProviders  → pending provider count
 *   - adminGetAllReviews   → total reviews count
 *
 * Also shows a short "Recent bookings" DataTable (last 5) linking to
 * /(admin-web)/bookings (route created in T4, cast to Href).
 *
 * Loading state → Skeleton cards. All read-only; no mutations.
 */

import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { router, type Href } from 'expo-router';

import { DataTable, type Column } from '@/components/admin-web/data-table';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Text } from '@/components/ui/text';
import { Spacing } from '@/constants/theme';
import { STATUS_LABELS } from '@/constants/booking-status';
import { formatKes } from '@/lib/currency';
import { getAllBookings, type Booking } from '@/lib/bookings';
import { adminGetAllPayments, type Payment } from '@/lib/payments';
import { getPendingProviders } from '@/lib/providers';
import { adminGetAllReviews } from '@/lib/reviews';

// ── Types ──────────────────────────────────────────────────────────────────

type DashboardData = {
  totalBookings: number;
  totalPayments: number;
  paidCount: number;
  totalPaidKes: number;
  pendingProviders: number;
  totalReviews: number;
  recentBookings: Booking[];
};

// ── Recent bookings table columns ──────────────────────────────────────────

const RECENT_COLUMNS: Column<Booking>[] = [
  {
    key: 'service_id',
    header: 'Service',
    render: (row) => (
      <Text variant="label" color="text">
        {row.service_id
          .replace(/-/g, ' ')
          .replace(/\b\w/g, (c) => c.toUpperCase())}
      </Text>
    ),
    width: '40%',
  },
  {
    key: 'status',
    header: 'Status',
    render: (row) => (
      <Text variant="label" color="textSecondary">
        {STATUS_LABELS[row.status] ?? row.status}
      </Text>
    ),
    width: '30%',
  },
  {
    key: 'scheduled_for',
    header: 'Date',
    render: (row) => (
      <Text variant="caption" color="textTertiary">
        {new Date(row.scheduled_for).toLocaleDateString()}
      </Text>
    ),
    width: '30%',
  },
];

// ── Stat card ──────────────────────────────────────────────────────────────

type StatCardProps = {
  label: string;
  value: string | number;
  sub?: string;
  loading: boolean;
};

function StatCard({ label, value, sub, loading }: StatCardProps) {
  return (
    <Card style={styles.statCard}>
      <Text variant="caption" color="textSecondary">
        {label}
      </Text>
      {loading ? (
        <Skeleton height={28} width="60%" radius={6} />
      ) : (
        <Text variant="title" color="text">
          {value}
        </Text>
      )}
      {sub ? (
        loading ? (
          <Skeleton height={14} width="40%" radius={4} />
        ) : (
          <Text variant="caption" color="textSecondary">
            {sub}
          </Text>
        )
      ) : null}
    </Card>
  );
}

// ── Screen ─────────────────────────────────────────────────────────────────

export default function AdminDashboard() {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<DashboardData | null>(null);

  useEffect(() => {
    let active = true;

    async function load() {
      const [bookings, payments, pending, reviews] = await Promise.all([
        getAllBookings(),
        adminGetAllPayments(),
        getPendingProviders(),
        adminGetAllReviews(),
      ]);

      if (!active) return;

      const paidPayments = (payments as Payment[]).filter((p) => p.status === 'paid');
      const totalPaidKes = paidPayments.reduce((sum, p) => sum + (p.amount ?? 0), 0);

      setData({
        totalBookings: bookings.length,
        totalPayments: payments.length,
        paidCount: paidPayments.length,
        totalPaidKes,
        pendingProviders: pending.length,
        totalReviews: reviews.length,
        recentBookings: bookings.slice(0, 5),
      });
      setLoading(false);
    }

    load();
    return () => {
      active = false;
    };
  }, []);

  return (
    <View style={styles.root}>
      {/* Summary stat cards */}
      <View style={styles.statsGrid}>
        <StatCard
          label="Total Bookings"
          value={data?.totalBookings ?? 0}
          loading={loading}
        />
        <StatCard
          label="Payments"
          value={data ? `${data.paidCount} / ${data.totalPayments} paid` : '—'}
          sub={data ? formatKes(data.totalPaidKes) + ' received' : undefined}
          loading={loading}
        />
        <StatCard
          label="Pending Providers"
          value={data?.pendingProviders ?? 0}
          sub="awaiting approval"
          loading={loading}
        />
        <StatCard
          label="Total Reviews"
          value={data?.totalReviews ?? 0}
          loading={loading}
        />
      </View>

      {/* Recent bookings section */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text variant="heading" color="text" weight="semibold">
            Recent Bookings
          </Text>
          <Button
            label="View all"
            variant="ghost"
            size="md"
            onPress={() => router.push('/(admin-web)/bookings' as Href)}
          />
        </View>

        <DataTable
          columns={RECENT_COLUMNS}
          rows={data?.recentBookings ?? []}
          keyExtractor={(b) => b.id}
          loading={loading}
          emptyLabel="No bookings yet"
          onRowPress={(b) =>
            router.push(`/(admin-web)/bookings/${b.id}` as Href)
          }
        />
      </View>
    </View>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: {
    gap: Spacing.four,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.three,
  },
  statCard: {
    flex: 1,
    minWidth: 160,
    gap: Spacing.one,
  },
  section: {
    gap: Spacing.three,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
});
