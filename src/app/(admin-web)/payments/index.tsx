/**
 * src/app/(admin-web)/payments/index.tsx — Web Admin Payments List
 *
 * Loads all payments via adminGetAllPayments() on mount and displays them in a
 * DataTable. Each row shows amount, status badge, split, method, booking ref,
 * and date. Admin can override the payment status via four small buttons per row.
 *
 * Wrapped by AdminShell via the (admin-web)/_layout.tsx — this screen only
 * needs to return its content (no Shell wrapper here).
 */

import { useState } from 'react';
import { View } from 'react-native';
import { router, type Href } from 'expo-router';

import { DataTable, type Column } from '@/components/admin-web/data-table';
import { PageMeta } from '@/components/admin-web/page-meta';
import { PaymentStatusBadge } from '@/components/ui/payment-status-badge';
import { Button } from '@/components/ui/button';
import { LoadMoreButton } from '@/components/ui/load-more-button';
import { Text } from '@/components/ui/text';
import { formatKes } from '@/lib/currency';
import { usePaginatedList } from '@/hooks/use-paginated-list';
import {
  adminGetAllPayments,
  adminOverridePaymentStatus,
  type Payment,
  type PaymentStatus,
} from '@/lib/payments';

// ── Constants ──────────────────────────────────────────────────────────────

const ALL_PAYMENT_STATUSES: PaymentStatus[] = ['pending', 'paid', 'refunded', 'cancelled'];

// ── Column definitions ─────────────────────────────────────────────────────

function buildColumns(
  onOverride: (id: string, status: PaymentStatus) => void,
): Column<Payment>[] {
  return [
    {
      key: 'amount',
      header: 'Amount',
      render: (row) => (
        <Text variant="label" color="text">
          {formatKes(row.amount)}
        </Text>
      ),
      width: 100,
      align: 'right',
    },
    {
      key: 'status',
      header: 'Status',
      render: (row) => <PaymentStatusBadge status={row.status} />,
      width: 110,
    },
    {
      key: 'split',
      header: 'Split',
      render: (row) => (
        <Text variant="caption" color="textSecondary">
          {`Provider ${formatKes(row.provider_share)} · QuickServe ${formatKes(row.quickserve_share)}`}
        </Text>
      ),
      width: 220,
    },
    {
      key: 'method',
      header: 'Method',
      render: (row) => (
        <Text variant="caption" color="textSecondary">
          {row.payment_method ?? '—'}
        </Text>
      ),
      width: 90,
    },
    {
      key: 'booking',
      header: 'Booking',
      render: (row) => (
        <Text variant="caption" color="textSecondary">
          {`#${row.booking_id.slice(0, 8)}`}
        </Text>
      ),
      width: 100,
    },
    {
      key: 'date',
      header: 'Date',
      render: (row) => (
        <Text variant="caption" color="textSecondary">
          {new Date(row.created_at).toLocaleDateString()}
        </Text>
      ),
      width: 110,
    },
    {
      key: 'actions',
      header: 'Override',
      render: (row) => (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4 }}>
          {ALL_PAYMENT_STATUSES.map((s) => (
            <Button
              key={s}
              label={s.charAt(0).toUpperCase() + s.slice(1)}
              variant={row.status === s ? 'secondary' : 'ghost'}
              onPress={() => onOverride(row.id, s)}
            />
          ))}
        </View>
      ),
      width: 280,
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
              `/(admin-web)/operations/new?payment_id=${row.id}` as Href,
            )
          }
        />
      ),
      width: 110,
    },
  ];
}

// ── Screen ──────────────────────────────────────────────────────────────────

export default function AdminWebPaymentsScreen() {
  const [actionError, setActionError] = useState('');

  const {
    items: payments,
    loading,
    error: loadError,
    hasMore,
    loadMore,
    reload,
  } = usePaginatedList((p, s) => adminGetAllPayments(p, s));

  async function handleOverride(paymentId: string, status: PaymentStatus) {
    setActionError('');
    const result = await adminOverridePaymentStatus(paymentId, status);
    if (!result.ok) {
      setActionError(result.error ?? 'Could not update payment status.');
    } else {
      // Reload to get fresh data after override
      reload();
    }
  }

  const columns = buildColumns(handleOverride);

  return (
    <>
      <PageMeta title="Payments" />
      {actionError ? (
        <Text variant="caption" color="error">
          {actionError}
        </Text>
      ) : null}
      <DataTable
        columns={columns}
        rows={payments}
        keyExtractor={(p) => p.id}
        loading={loading}
        error={!!loadError}
        onRetry={reload}
        emptyLabel="No payments yet."
      />
      <LoadMoreButton onPress={loadMore} loading={loading} hasMore={hasMore} />
    </>
  );
}
