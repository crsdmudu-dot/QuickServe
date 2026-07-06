// receipt-view.tsx — Full receipt layout for a completed payment.
// Shows payment status/method/date + PaymentBreakdownCard.
// Download/Share buttons are placeholder-disabled ("Coming soon")
// when canDownloadReceipt is false (which it currently always is).
// No payment/wallet/promo mutation.

import { StyleSheet, View } from 'react-native';

import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { type Receipt, canDownloadReceipt } from '@/lib/receipts';
import { Card } from '@/components/ui/card';
import { Text } from '@/components/ui/text';
import { Button } from '@/components/ui/button';
import { SectionHeader } from '@/components/ui/section-header';
import { PaymentBreakdownCard } from '@/components/customer/payment-breakdown-card';

// ── Props ──────────────────────────────────────────────────────────────────────

export type ReceiptViewProps = {
  receipt: Receipt;
  /** Placeholder callback — currently always disabled. */
  onDownload?: () => void;
  /** Placeholder callback — currently always disabled. */
  onShare?: () => void;
};

// ── Component ──────────────────────────────────────────────────────────────────

export function ReceiptView({ receipt, onDownload, onShare }: ReceiptViewProps) {
  const theme = useTheme();

  // Format the paid-at date
  const paidAtLabel = receipt.paidAt
    ? new Date(receipt.paidAt).toLocaleString(undefined, {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : '—';

  // Humanise payment method
  const methodLabel = receipt.method
    ? receipt.method.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
    : '—';

  // Status display
  const statusLabel = receipt.status
    ? receipt.status.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
    : '—';

  return (
    <View style={styles.container}>
      {/* ── Header ── */}
      <SectionHeader title="Receipt" />

      {/* ── Payment meta card ── */}
      <Card elevation="e1">
        <View style={styles.metaGrid}>
          <MetaRow label="Status"  value={statusLabel}  />
          <MetaRow label="Method"  value={methodLabel}  />
          <MetaRow label="Paid at" value={paidAtLabel}  />
          {receipt.bookingId && (
            <MetaRow label="Booking" value={`#${receipt.bookingId.slice(0, 8).toUpperCase()}`} />
          )}
        </View>
      </Card>

      {/* ── Breakdown ── */}
      <PaymentBreakdownCard receipt={receipt} />

      {/* ── Download / Share placeholders ── */}
      <View style={styles.actions}>
        <Button
          label={canDownloadReceipt ? 'Download PDF' : 'Download (Coming soon)'}
          variant="secondary"
          disabled={!canDownloadReceipt}
          onPress={canDownloadReceipt ? onDownload : undefined}
        />
        <Button
          label={canDownloadReceipt ? 'Share' : 'Share (Coming soon)'}
          variant="secondary"
          disabled={!canDownloadReceipt}
          onPress={canDownloadReceipt ? onShare : undefined}
        />
      </View>
    </View>
  );
}

// ── MetaRow sub-component ──────────────────────────────────────────────────────

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metaRow}>
      <Text variant="caption" color="textSecondary" style={styles.metaLabel}>
        {label}
      </Text>
      <Text variant="label" weight="medium">
        {value}
      </Text>
    </View>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    gap: Spacing.three,
  },
  metaGrid: {
    gap: Spacing.two,
  },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  metaLabel: {
    flex: 1,
  },
  actions: {
    flexDirection: 'row',
    gap: Spacing.two,
    flexWrap: 'wrap',
  },
});
