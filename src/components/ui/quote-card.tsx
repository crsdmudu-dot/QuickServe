/**
 * QuoteCard — displays the current quote for a booking.
 *
 * Shows the quoted amount (or a 'No quote yet' placeholder), the quote
 * status label, an optional PaymentStatusBadge, optional customer-facing
 * Accept/Decline action buttons, and an optional admin-only provider/
 * QuickServe split breakdown.
 *
 * IMPORTANT: the split breakdown is NEVER rendered unless the `split` prop
 * is explicitly passed.  Customer callers must never pass `split`.
 */

import { StyleSheet, View } from 'react-native';

import { Spacing } from '@/constants/theme';
import type { PaymentStatus } from '@/lib/payments';
import type { QuoteStatus } from '@/lib/quotes';
import { formatKes } from '@/lib/currency';
import { Card } from '@/components/ui/card';
import { Text } from '@/components/ui/text';
import { Button } from '@/components/ui/button';
import { PaymentStatusBadge } from '@/components/ui/payment-status-badge';

// Human-readable labels for each quote lifecycle stage.
const QUOTE_STATUS_LABELS: Record<QuoteStatus, string> = {
  pending: 'Awaiting quote',
  sent: 'Quote sent',
  accepted: 'Quote accepted',
  declined: 'Quote declined',
};

export type QuoteCardProps = {
  /** The raw quoted amount in KES, or null when no quote has been set yet. */
  amount: number | null;
  /** Current stage of the quote lifecycle. */
  quoteStatus: QuoteStatus;
  /** When present, renders a PaymentStatusBadge below the quote status. */
  paymentStatus?: PaymentStatus;
  /** Customer: pass to render the Accept button and wire its press handler. */
  onAccept?: () => void;
  /** Customer: pass to render the Decline button and wire its press handler. */
  onDecline?: () => void;
  /**
   * ADMIN-ONLY — renders a provider/QuickServe split breakdown row.
   * Customer callers MUST NOT pass this prop.
   */
  split?: { providerShare: number; quickserveShare: number };
};

export function QuoteCard({
  amount,
  quoteStatus,
  paymentStatus,
  onAccept,
  onDecline,
  split,
}: QuoteCardProps) {
  return (
    <Card>
      <View style={styles.content}>
        {/* Amount row */}
        {amount != null ? (
          <Text variant="title">{formatKes(amount)}</Text>
        ) : (
          <Text variant="caption" color="textSecondary">
            No quote yet
          </Text>
        )}

        {/* Quote status label */}
        <Text variant="caption" color="textSecondary">
          {QUOTE_STATUS_LABELS[quoteStatus]}
        </Text>

        {/* Optional payment status badge */}
        {paymentStatus != null && (
          <PaymentStatusBadge status={paymentStatus} />
        )}

        {/* ADMIN-ONLY split breakdown — only rendered when the prop is passed */}
        {split != null && (
          <View style={styles.split}>
            <Text variant="caption" color="textSecondary">
              {`Provider: ${formatKes(split.providerShare)}`}
            </Text>
            <Text variant="caption" color="textSecondary">
              {`QuickServe: ${formatKes(split.quickserveShare)}`}
            </Text>
          </View>
        )}

        {/* Customer action buttons — only rendered when handlers are provided */}
        {(onAccept != null || onDecline != null) && (
          <View style={styles.actions}>
            {onAccept != null && (
              <Button label="Accept" onPress={onAccept} variant="primary" />
            )}
            {onDecline != null && (
              <Button label="Decline" onPress={onDecline} variant="secondary" />
            )}
          </View>
        )}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: Spacing.two,
  },
  split: {
    gap: Spacing.half,
  },
  actions: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
});
