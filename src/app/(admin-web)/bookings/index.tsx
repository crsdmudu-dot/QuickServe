/**
 * src/app/(admin-web)/bookings/index.tsx — Web Admin Bookings List
 *
 * Loads all bookings via getAllBookings() on mount and displays them in a
 * DataTable. Tapping a row navigates to the booking detail screen.
 *
 * Wrapped by AdminShell via the (admin-web)/_layout.tsx — this screen only
 * needs to return its content (no Shell wrapper here).
 */

import { useEffect, useState } from 'react';
import { router, type Href } from 'expo-router';

import { DataTable, type Column } from '@/components/admin-web/data-table';
import { StatusBadge } from '@/components/ui/status-badge';
import { Text } from '@/components/ui/text';
import { SERVICES } from '@/constants/services';
import { getAllBookings, type Booking } from '@/lib/bookings';
import type { QuoteStatus } from '@/lib/quotes';

// ── Quote status labels ────────────────────────────────────────────────────

const QUOTE_STATUS_LABELS: Record<QuoteStatus, string> = {
  pending: 'Awaiting quote',
  sent: 'Quote sent',
  accepted: 'Quote accepted',
  declined: 'Quote declined',
};

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
    width: '30%',
  },
  {
    key: 'status',
    header: 'Status',
    render: (row) => <StatusBadge status={row.status} />,
    width: '20%',
  },
  {
    key: 'scheduled_for',
    header: 'Scheduled',
    render: (row) => (
      <Text variant="caption" color="textSecondary">
        {new Date(row.scheduled_for).toLocaleString()}
      </Text>
    ),
    width: '30%',
  },
  {
    key: 'quote_status',
    header: 'Quote',
    render: (row) => (
      <Text variant="caption" color="textSecondary">
        {QUOTE_STATUS_LABELS[row.quote_status]}
      </Text>
    ),
    width: '20%',
  },
];

// ── Screen ─────────────────────────────────────────────────────────────────

export default function AdminWebBookingsScreen() {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    getAllBookings().then((rows) => {
      if (!active) return;
      setBookings(rows);
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, []);

  return (
    <DataTable
      columns={COLUMNS}
      rows={bookings}
      keyExtractor={(b) => b.id}
      loading={loading}
      emptyLabel="No bookings yet."
      onRowPress={(b) => router.push(`/(admin-web)/bookings/${b.id}` as Href)}
    />
  );
}
