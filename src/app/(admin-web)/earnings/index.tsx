/**
 * src/app/(admin-web)/earnings/index.tsx — Web Admin Earnings & Payouts List
 *
 * Loads all provider earnings via adminGetAllEarnings() on mount and displays
 * them in a DataTable. Each row shows amount, payout status, provider ref,
 * booking ref, and date. Pending rows get a "Mark payout paid" button that
 * updates the local row on success.
 *
 * Wrapped by AdminShell via the (admin-web)/_layout.tsx — this screen only
 * needs to return its content (no Shell wrapper here).
 */

import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { DataTable, type Column } from '@/components/admin-web/data-table';
import { PageMeta } from '@/components/admin-web/page-meta';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { Radii, Spacing, type ThemeColor } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { formatKes } from '@/lib/currency';
import {
  adminGetAllEarnings,
  adminMarkPayoutPaid,
  type ProviderEarning,
  type PayoutStatus,
} from '@/lib/earnings';

// ── Payout status badge ────────────────────────────────────────────────────

const PAYOUT_STATUS_COLORS: Record<PayoutStatus, ThemeColor> = {
  pending: 'warning',
  paid: 'success',
};

const COLOR_TO_SURFACE: Partial<Record<ThemeColor, ThemeColor>> = {
  success: 'successSurface',
  warning: 'warningSurface',
};

const PAYOUT_STATUS_LABELS: Record<PayoutStatus, string> = {
  pending: 'Pending',
  paid: 'Paid',
};

function PayoutStatusBadge({ status }: { status: PayoutStatus }) {
  const theme = useTheme();
  const color = PAYOUT_STATUS_COLORS[status];
  const surfaceKey: ThemeColor = COLOR_TO_SURFACE[color] ?? 'surfaceMuted';
  return (
    <View style={[badgeStyles.pill, { backgroundColor: theme[surfaceKey] }]}>
      <Text variant="caption" color={color}>
        {PAYOUT_STATUS_LABELS[status]}
      </Text>
    </View>
  );
}

const badgeStyles = StyleSheet.create({
  pill: {
    alignSelf: 'flex-start',
    borderRadius: Radii.pill,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.one,
  },
});

// ── Column definitions ─────────────────────────────────────────────────────

function buildColumns(
  onMarkPaid: (id: string) => void,
): Column<ProviderEarning>[] {
  return [
    {
      key: 'amount',
      header: 'Amount',
      render: (row) => (
        <Text variant="label" color="text">
          {formatKes(row.amount)}
        </Text>
      ),
      width: 110,
    },
    {
      key: 'payout_status',
      header: 'Payout Status',
      render: (row) => <PayoutStatusBadge status={row.payout_status} />,
      width: 120,
    },
    {
      key: 'provider',
      header: 'Provider',
      render: (row) => (
        <Text variant="caption" color="textSecondary">
          {`#${row.provider_id.slice(0, 8)}`}
        </Text>
      ),
      width: 110,
    },
    {
      key: 'booking',
      header: 'Booking',
      render: (row) => (
        <Text variant="caption" color="textSecondary">
          {`#${row.booking_id.slice(0, 8)}`}
        </Text>
      ),
      width: 110,
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
        if (row.payout_status !== 'pending') {
          return (
            <Text variant="caption" color="textSecondary">
              {'—'}
            </Text>
          );
        }
        return (
          <Button
            label="Mark payout paid"
            onPress={() => onMarkPaid(row.id)}
          />
        );
      },
      width: 160,
    },
  ];
}

// ── Screen ──────────────────────────────────────────────────────────────────

export default function AdminWebEarningsScreen() {
  const [earnings, setEarnings] = useState<ProviderEarning[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    adminGetAllEarnings().then((rows) => {
      if (!active) return;
      setEarnings(rows);
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, []);

  async function handleMarkPaid(id: string) {
    setError('');
    const result = await adminMarkPayoutPaid(id);
    if (result.ok) {
      setEarnings((prev) =>
        prev.map((e) => (e.id === id ? { ...e, payout_status: 'paid' as PayoutStatus } : e)),
      );
    } else {
      setError(result.error ?? 'Could not update payout.');
    }
  }

  const columns = buildColumns(handleMarkPaid);

  return (
    <>
      <PageMeta title="Earnings & Payouts" />
      {error ? (
        <Text variant="caption" color="error">
          {error}
        </Text>
      ) : null}
      <DataTable
        columns={columns}
        rows={earnings}
        keyExtractor={(e) => e.id}
        loading={loading}
        emptyLabel="No earnings yet."
      />
    </>
  );
}
