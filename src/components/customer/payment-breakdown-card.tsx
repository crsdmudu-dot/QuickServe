// payment-breakdown-card.tsx — Displays a Receipt's line items and totals.
// Display-only — no payment mutation, no wallet/promo re-computation.
// Wallet credit and promo discount lines are hidden when their amounts are 0.

import { StyleSheet, View } from 'react-native';

import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { type Receipt } from '@/lib/receipts';
import { formatKes } from '@/lib/currency';
import { Card } from '@/components/ui/card';
import { Text } from '@/components/ui/text';

// ── Props ──────────────────────────────────────────────────────────────────────

export type PaymentBreakdownCardProps = {
  receipt: Receipt;
};

// ── Component ──────────────────────────────────────────────────────────────────

export function PaymentBreakdownCard({ receipt }: PaymentBreakdownCardProps) {
  const theme = useTheme();

  return (
    <Card elevation="e1">
      <View style={styles.container}>
        {/* Subtotal */}
        <Row label="Subtotal" value={formatKes(receipt.subtotal)} />

        {/* Wallet credit — hidden when 0 */}
        {receipt.walletApplied > 0 && (
          <Row
            label="Wallet credit"
            value={`- ${formatKes(receipt.walletApplied)}`}
            testIDValue="wallet-credit-value"
            valueColor="success"
          />
        )}

        {/* Promo discount — hidden when 0 */}
        {receipt.promoDiscount > 0 && (
          <Row
            label="Promo discount"
            value={`- ${formatKes(receipt.promoDiscount)}`}
            testIDValue="promo-discount-value"
            valueColor="success"
          />
        )}

        {/* Amount Due */}
        <Row
          label="Amount due"
          value={formatKes(receipt.amountDue)}
          testIDValue="amount-due-value"
        />

        {/* Divider */}
        <View style={[styles.divider, { backgroundColor: theme.border }]} />

        {/* Total */}
        <Row
          label="Total"
          value={formatKes(receipt.total)}
          testIDValue="total-value"
          bold
        />
      </View>
    </Card>
  );
}

// ── Row sub-component ──────────────────────────────────────────────────────────

type RowProps = {
  label: string;
  value: string;
  testIDValue?: string;
  valueColor?: 'success' | 'text';
  bold?: boolean;
};

function Row({ label, value, testIDValue, valueColor = 'text', bold = false }: RowProps) {
  return (
    <View style={styles.row}>
      <Text variant="body" color="textSecondary" style={styles.rowLabel}>
        {label}
      </Text>
      <Text
        testID={testIDValue}
        variant="body"
        color={valueColor}
        weight={bold ? 'semibold' : 'regular'}
      >
        {value}
      </Text>
    </View>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    gap: Spacing.two,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  rowLabel: {
    flex: 1,
  },
  divider: {
    height: 1,
    marginVertical: Spacing.one,
  },
});
