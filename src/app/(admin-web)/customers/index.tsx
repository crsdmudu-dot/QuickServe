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

import { useCallback, useEffect, useState } from 'react';
import { router, type Href } from 'expo-router';

import { DataTable, type Column } from '@/components/admin-web/data-table';
import { PageMeta } from '@/components/admin-web/page-meta';
import { Button } from '@/components/ui/button';
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
    {
      key: 'operations',
      header: 'Operations',
      render: (row) => (
        <Button
          label="Create case"
          variant="ghost"
          onPress={() =>
            router.push(
              `/(admin-web)/operations/new?customer_id=${row.id}` as Href,
            )
          }
        />
      ),
      width: 120,
    },
  ];
}

// ── Screen ──────────────────────────────────────────────────────────────────

export default function AdminWebCustomersScreen() {
  const [customers, setCustomers] = useState<CustomerProfile[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    setError(false);
    setLoading(true);
    try {
      const [customerRows, bookingRows] = await Promise.all([
        adminGetAllCustomers(),
        getAllBookings(),
      ]);
      setCustomers(customerRows);
      setBookings(bookingRows);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const columns = buildColumns(bookings);

  return (
    <>
      <PageMeta title="Customers" />
      <DataTable
        columns={columns}
        rows={customers}
        keyExtractor={(c) => c.id}
        loading={loading}
        error={error}
        onRetry={load}
        emptyLabel="No customers yet."
      />
    </>
  );
}
