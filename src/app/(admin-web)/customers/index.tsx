/**
 * src/app/(admin-web)/customers/index.tsx — Web Admin Customers List (read-only)
 *
 * Loads all customer profiles via adminGetAllCustomers() on mount and displays
 * them in a DataTable. Each row shows the customer's name, phone, join date,
 * and a booking count derived client-side from getAllBookings().
 *
 * This screen is STRICTLY read-only — no edit, delete, or action buttons.
 *
 * Wrapped by AdminShell via the (admin-web)/_layout.tsx — this screen only
 * needs to return its content (no Shell wrapper here).
 */

import { useEffect, useState } from 'react';

import { DataTable, type Column } from '@/components/admin-web/data-table';
import { Text } from '@/components/ui/text';
import { adminGetAllCustomers, type CustomerProfile } from '@/lib/customers';
import { getAllBookings, type Booking } from '@/lib/bookings';

// ── Column definitions ─────────────────────────────────────────────────────

function buildColumns(bookings: Booking[]): Column<CustomerProfile>[] {
  return [
    {
      key: 'full_name',
      header: 'Name',
      render: (row) => (
        <Text variant="label" color="text">
          {row.full_name ?? '—'}
        </Text>
      ),
      width: 180,
    },
    {
      key: 'phone',
      header: 'Phone',
      render: (row) => (
        <Text variant="caption" color="textSecondary">
          {row.phone ?? '—'}
        </Text>
      ),
      width: 140,
    },
    {
      key: 'joined',
      header: 'Joined',
      render: (row) => (
        <Text variant="caption" color="textSecondary">
          {new Date(row.created_at).toLocaleDateString()}
        </Text>
      ),
      width: 120,
    },
    {
      key: 'bookings',
      header: 'Bookings',
      render: (row) => {
        const count = bookings.filter((b) => b.customer_id === row.id).length;
        return (
          <Text variant="caption" color="textSecondary">
            {count}
          </Text>
        );
      },
      width: 90,
    },
  ];
}

// ── Screen ──────────────────────────────────────────────────────────────────

export default function AdminWebCustomersScreen() {
  const [customers, setCustomers] = useState<CustomerProfile[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    Promise.all([adminGetAllCustomers(), getAllBookings()]).then(
      ([customerRows, bookingRows]) => {
        if (!active) return;
        setCustomers(customerRows);
        setBookings(bookingRows);
        setLoading(false);
      },
    );

    return () => {
      active = false;
    };
  }, []);

  const columns = buildColumns(bookings);

  return (
    <DataTable
      columns={columns}
      rows={customers}
      keyExtractor={(c) => c.id}
      loading={loading}
      emptyLabel="No customers yet."
    />
  );
}
