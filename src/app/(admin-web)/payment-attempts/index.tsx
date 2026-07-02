/**
 * src/app/(admin-web)/payment-attempts/index.tsx — Web Admin Payment Attempts List
 *
 * Loads all payment attempts via adminGetPaymentAttempts() on mount and displays
 * them in a DataTable. Each row shows amount, status badge, provider, phone,
 * Daraja refs, booking ref, and date. Pending/initiated rows get Confirm + Cancel
 * action buttons that reload the list on success.
 *
 * Wrapped by AdminShell via the (admin-web)/_layout.tsx — this screen only
 * needs to return its content (no Shell wrapper here).
 */

import { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';

import { DataTable, type Column } from '@/components/admin-web/data-table';
import { PageMeta } from '@/components/admin-web/page-meta';
import { AttemptStatusBadge } from '@/components/ui/attempt-status-badge';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { formatKes } from '@/lib/currency';
import {
  adminGetPaymentAttempts,
  adminConfirmAttempt,
  adminCancelAttempt,
  type PaymentAttempt,
} from '@/lib/attempts';

// ── Column definitions ─────────────────────────────────────────────────────

function buildColumns(
  onConfirm: (id: string) => void,
  onCancel: (id: string) => void,
): Column<PaymentAttempt>[] {
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
      render: (row) => <AttemptStatusBadge status={row.status} />,
      width: 110,
    },
    {
      key: 'provider',
      header: 'Provider',
      render: (row) => (
        <Text variant="caption" color="textSecondary">
          {row.provider.toUpperCase()}
        </Text>
      ),
      width: 90,
    },
    {
      key: 'phone',
      header: 'Phone',
      render: (row) => (
        <Text variant="caption" color="textSecondary">
          {row.phone ?? '—'}
        </Text>
      ),
      width: 130,
    },
    {
      key: 'daraja',
      header: 'Daraja refs',
      render: (row) => (
        <View style={{ gap: 2 }}>
          {row.checkout_request_id ? (
            <Text variant="caption" color="textSecondary">
              {`Checkout: ${row.checkout_request_id}`}
            </Text>
          ) : null}
          {row.result_code != null ? (
            <Text variant="caption" color="textSecondary">
              {`Result: ${row.result_code} · ${row.result_desc ?? ''}`}
            </Text>
          ) : null}
          {row.callback_received_at ? (
            <Text variant="caption" color="textSecondary">
              {`Callback: ${new Date(row.callback_received_at).toLocaleString()}`}
            </Text>
          ) : null}
          {!row.checkout_request_id && row.result_code == null && !row.callback_received_at ? (
            <Text variant="caption" color="textSecondary">
              {'—'}
            </Text>
          ) : null}
        </View>
      ),
      width: 240,
    },
    {
      key: 'booking',
      header: 'Payment',
      render: (row) => (
        <Text variant="caption" color="textSecondary">
          {`#${row.payment_id.slice(0, 8)}`}
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
      header: 'Actions',
      render: (row) => {
        if (row.status !== 'pending' && row.status !== 'initiated') {
          return (
            <Text variant="caption" color="textSecondary">
              {'—'}
            </Text>
          );
        }
        return (
          <View style={{ flexDirection: 'row', gap: 4 }}>
            <Button label="Confirm" onPress={() => onConfirm(row.id)} />
            <Button
              label="Cancel"
              variant="ghost"
              onPress={() => onCancel(row.id)}
            />
          </View>
        );
      },
      width: 160,
    },
  ];
}

// ── Screen ──────────────────────────────────────────────────────────────────

export default function AdminWebPaymentAttemptsScreen() {
  const [attempts, setAttempts] = useState<PaymentAttempt[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [actionError, setActionError] = useState('');

  const load = useCallback(async () => {
    setLoadError(false);
    setLoading(true);
    try {
      const rows = await adminGetPaymentAttempts();
      setAttempts(rows);
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleConfirm(id: string) {
    setActionError('');
    const r = await adminConfirmAttempt(id);
    if (r.ok) {
      const rows = await adminGetPaymentAttempts();
      setAttempts(rows);
    } else {
      setActionError(r.error ?? 'Could not confirm payment.');
    }
  }

  async function handleCancel(id: string) {
    setActionError('');
    const r = await adminCancelAttempt(id);
    if (r.ok) {
      const rows = await adminGetPaymentAttempts();
      setAttempts(rows);
    } else {
      setActionError(r.error ?? 'Could not cancel attempt.');
    }
  }

  const columns = buildColumns(handleConfirm, handleCancel);

  return (
    <>
      <PageMeta title="Payment attempts" />
      {actionError ? (
        <Text variant="caption" color="error">
          {actionError}
        </Text>
      ) : null}
      <DataTable
        columns={columns}
        rows={attempts}
        keyExtractor={(a) => a.id}
        loading={loading}
        error={loadError}
        onRetry={load}
        emptyLabel="No payment attempts yet."
      />
    </>
  );
}
