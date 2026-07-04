/**
 * src/app/(admin-web)/bookings/index.tsx — Web Admin Bookings List
 *
 * Loads all bookings via getAllBookings() on mount and displays them in a
 * DataTable. Tapping a row navigates to the booking detail screen.
 *
 * Wrapped by AdminShell via the (admin-web)/_layout.tsx — this screen only
 * needs to return its content (no Shell wrapper here).
 *
 * Slice 24 (Task 7): added Today/Tomorrow/Upcoming/Scheduled filter row between
 * PageMeta and DataTable.  The scheduled_for column now uses describeSchedule()
 * and shows a recurring label pill when recurrence !== 'one_time'.
 */

import { useState } from 'react';
import { router, type Href } from 'expo-router';
import { View, StyleSheet } from 'react-native';

import { DataTable, type Column } from '@/components/admin-web/data-table';
import { PageMeta } from '@/components/admin-web/page-meta';
import { StatusBadge } from '@/components/ui/status-badge';
import { Button } from '@/components/ui/button';
import { LoadMoreButton } from '@/components/ui/load-more-button';
import { Text } from '@/components/ui/text';
import { SERVICES } from '@/constants/services';
import { Spacing } from '@/constants/theme';
import { usePaginatedList } from '@/hooks/use-paginated-list';
import { getAllBookings, type Booking } from '@/lib/bookings';
import type { QuoteStatus } from '@/lib/quotes';
import {
  describeSchedule,
  recurrenceLabel,
  isToday,
  isTomorrow,
  isUpcoming,
  isScheduledType,
} from '@/lib/scheduling';

// ── Quote status labels ────────────────────────────────────────────────────

const QUOTE_STATUS_LABELS: Record<QuoteStatus, string> = {
  pending: 'Awaiting quote',
  sent: 'Quote sent',
  accepted: 'Quote accepted',
  declined: 'Quote declined',
};

// ── Filter model ───────────────────────────────────────────────────────────

type BookingFilter = 'all' | 'today' | 'tomorrow' | 'upcoming' | 'scheduled';

const FILTER_LABELS: { key: BookingFilter; label: string }[] = [
  { key: 'all',       label: 'All'       },
  { key: 'today',     label: 'Today'     },
  { key: 'tomorrow',  label: 'Tomorrow'  },
  { key: 'upcoming',  label: 'Upcoming'  },
  { key: 'scheduled', label: 'Scheduled' },
];

function matchesFilter(b: Booking, filter: BookingFilter): boolean {
  switch (filter) {
    case 'today':     return isToday(b.scheduled_for);
    case 'tomorrow':  return isTomorrow(b.scheduled_for);
    case 'upcoming':  return isUpcoming(b.scheduled_for);
    case 'scheduled': return isScheduledType(b.scheduling_type);
    default:          return true; // 'all'
  }
}

// ── Table columns ──────────────────────────────────────────────────────────

const COLUMNS: Column<Booking>[] = [
  {
    key: 'service_id',
    header: 'Service',
    render: (row) => (
      <Text variant="label" color="text">
        {SERVICES.find((s) => s.id === row.service_id)?.title ?? row.service_id}
      </Text>
    ),
    width: '25%',
  },
  {
    key: 'status',
    header: 'Status',
    render: (row) => <StatusBadge status={row.status} />,
    width: '15%',
  },
  {
    key: 'scheduled_for',
    header: 'Scheduled',
    render: (row) => (
      <View style={styles.scheduleCell}>
        <Text variant="caption" color="textSecondary">
          {describeSchedule(row)}
        </Text>
        {row.recurrence && row.recurrence !== 'one_time' && (
          <Text variant="caption" color="textSecondary" style={styles.recurrenceText}>
            {recurrenceLabel(row.recurrence)}
          </Text>
        )}
      </View>
    ),
    width: '35%',
  },
  {
    key: 'quote_status',
    header: 'Quote',
    render: (row) => (
      <Text variant="caption" color="textSecondary">
        {QUOTE_STATUS_LABELS[row.quote_status]}
      </Text>
    ),
    width: '25%',
  },
];

// ── Styles ─────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  filterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.one,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.four,
  },
  scheduleCell: {
    gap: 2,
  },
  recurrenceText: {
    fontStyle: 'italic',
  },
});

// ── Screen ─────────────────────────────────────────────────────────────────

export default function AdminWebBookingsScreen() {
  const [bookingFilter, setBookingFilter] = useState<BookingFilter>('all');

  const {
    items: bookings,
    loading,
    error,
    hasMore,
    loadMore,
    reload,
  } = usePaginatedList((p, s) => getAllBookings(p, s));

  const shown = bookings.filter((b) => matchesFilter(b, bookingFilter));

  return (
    <>
      <PageMeta title="Bookings" />

      {/* Filter row */}
      <View style={styles.filterRow}>
        {FILTER_LABELS.map(({ key, label }) => (
          <Button
            key={key}
            label={label}
            variant={bookingFilter === key ? 'secondary' : 'ghost'}
            onPress={() => setBookingFilter(key)}
          />
        ))}
      </View>

      <DataTable
        columns={COLUMNS}
        rows={shown}
        keyExtractor={(b) => b.id}
        loading={loading}
        error={!!error}
        onRetry={reload}
        emptyLabel="No bookings yet."
        onRowPress={(b) => router.push(`/(admin-web)/bookings/${b.id}` as Href)}
      />
      <LoadMoreButton onPress={loadMore} loading={loading} hasMore={hasMore} />
    </>
  );
}
