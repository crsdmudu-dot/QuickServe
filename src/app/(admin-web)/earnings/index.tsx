/**
 * src/app/(admin-web)/earnings/index.tsx — Web Admin Provider Earnings & Payouts
 *
 * Lists every provider earning with its authoritative ledger figures — entitlement, deductions,
 * net payable, disbursed and outstanding — read from the provider_payout_ledger view.
 *
 * The legacy one-click "Mark payout paid" action is GONE. Marking a status without an amount,
 * method, reference, actor or date is not evidence of a payment. Selecting a row now opens the
 * payout panel, where the admin records a transfer that has ALREADY been made externally.
 *
 * Wrapped by AdminShell via the (admin-web)/_layout.tsx.
 */

import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { AdminProviderPayoutPanel } from '@/components/admin-web/admin-provider-payout-panel';
import { DataTable, type Column } from '@/components/admin-web/data-table';
import { PageMeta } from '@/components/admin-web/page-meta';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { Radii, Spacing, type ThemeColor } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { formatKes } from '@/lib/currency';
import {
  adminGetPayoutLedger,
  type PayoutStatus,
  type ProviderPayoutLedgerRow,
} from '@/lib/earnings';

// ── Payout status badge ────────────────────────────────────────────────────

const PAYOUT_STATUS_COLORS: Record<PayoutStatus, ThemeColor> = {
  pending: 'warning',
  partially_paid: 'warning',
  paid: 'success',
};

const COLOR_TO_SURFACE: Partial<Record<ThemeColor, ThemeColor>> = {
  success: 'successSurface',
  warning: 'warningSurface',
};

const PAYOUT_STATUS_LABELS: Record<PayoutStatus, string> = {
  pending: 'Pending',
  partially_paid: 'Partially paid',
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
  onSelect: (earningId: string) => void,
): Column<ProviderPayoutLedgerRow>[] {
  return [
    {
      key: 'entitlement',
      header: 'Entitlement',
      render: (row) => (
        <Text variant="label" color="text">
          {formatKes(row.provider_entitlement)}
        </Text>
      ),
      width: 110,
      align: 'right',
    },
    {
      key: 'deductions',
      header: 'Deductions',
      render: (row) => (
        <Text variant="caption" color="textSecondary">
          {formatKes(row.deductions_total)}
        </Text>
      ),
      width: 100,
      align: 'right',
    },
    {
      key: 'net',
      header: 'Net payable',
      render: (row) => (
        <Text variant="label" color="text">
          {formatKes(row.net_provider_payable)}
        </Text>
      ),
      width: 110,
      align: 'right',
    },
    {
      key: 'disbursed',
      header: 'Disbursed',
      render: (row) => (
        <Text variant="caption" color="textSecondary">
          {formatKes(row.amount_disbursed)}
        </Text>
      ),
      width: 100,
      align: 'right',
    },
    {
      key: 'outstanding',
      header: 'Outstanding',
      render: (row) => (
        <Text variant="label" color="text">
          {formatKes(row.outstanding_provider_liability)}
        </Text>
      ),
      width: 110,
      align: 'right',
    },
    {
      key: 'payout_status',
      header: 'Payout Status',
      render: (row) => <PayoutStatusBadge status={row.stored_payout_status} />,
      width: 130,
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
      key: 'actions',
      header: 'Actions',
      render: (row) => (
        <Button
          label={
            row.outstanding_provider_liability > 0 ? 'Record payout' : 'View ledger'
          }
          onPress={() => onSelect(row.earning_id)}
        />
      ),
      width: 150,
    },
  ];
}

// ── Screen ──────────────────────────────────────────────────────────────────

export default function AdminWebEarningsScreen() {
  const [rows, setRows] = useState<ProviderPayoutLedgerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoadError(false);
    setLoading(true);
    try {
      setRows(await adminGetPayoutLedger());
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const columns = buildColumns(setSelectedId);

  return (
    <>
      <PageMeta title="Earnings & Payouts" />
      <DataTable
        columns={columns}
        rows={rows}
        keyExtractor={(r) => r.earning_id}
        loading={loading}
        error={loadError}
        onRetry={load}
        emptyLabel="No earnings yet."
      />
      {selectedId ? (
        <View style={styles.panel}>
          <Button label="Close ledger" variant="ghost" onPress={() => setSelectedId(null)} />
          <AdminProviderPayoutPanel earningId={selectedId} onChanged={load} />
        </View>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  panel: { marginTop: Spacing.four, gap: Spacing.two },
});
