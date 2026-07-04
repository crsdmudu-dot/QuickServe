/**
 * wallet-transaction-row.tsx — A single row in the wallet transaction list.
 *
 * Shows the transaction type label, signed amount (+ for credits, − for debits),
 * date, and an optional note. Display-only — no interaction.
 */

import { StyleSheet, View } from 'react-native';

import { Spacing } from '@/constants/theme';
import { formatKes } from '@/lib/currency';
import { WALLET_TXN_TYPES, type WalletTransaction } from '@/lib/wallet';
import { Card } from '@/components/ui/card';
import { Text } from '@/components/ui/text';

export type WalletTransactionRowProps = { txn: WalletTransaction };

export function WalletTransactionRow({ txn }: WalletTransactionRowProps) {
  // Positive amounts are credits; negative are debits.
  const positive = txn.amount >= 0;

  // Look up the human-readable label; fall back to the raw type string.
  const label = WALLET_TXN_TYPES[txn.type]?.label ?? txn.type;

  // e.g. "+KES 500" or "−KES 300"
  const signedAmount = (positive ? '+' : '−') + formatKes(Math.abs(txn.amount));

  const dateStr = new Date(txn.created_at).toLocaleDateString();

  return (
    <Card>
      <View style={styles.row}>
        {/* Left: label + optional note + date */}
        <View style={styles.left}>
          <Text variant="label">{label}</Text>
          {txn.note ? (
            <Text variant="caption" color="textSecondary">
              {txn.note}
            </Text>
          ) : null}
          <Text variant="caption" color="textTertiary">
            {dateStr}
          </Text>
        </View>

        {/* Right: signed amount, coloured by direction */}
        <Text
          variant="label"
          weight="semibold"
          color={positive ? 'success' : 'error'}
        >
          {signedAmount}
        </Text>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: Spacing.two,
  },
  left: {
    flex: 1,
    gap: Spacing.half,
  },
});
