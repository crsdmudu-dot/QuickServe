/**
 * PaymentStatusBadge — a small pill-shaped label that communicates the
 * current payment status at a glance.  Mirrors StatusBadge exactly but
 * maps the four PaymentStatus values to their own colors and labels.
 */

import { StyleSheet, View } from 'react-native';

import { Radii, Spacing, type ThemeColor } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { Text } from '@/components/ui/text';
import type { PaymentStatus } from '@/lib/payments';

// Map each status to the theme token that controls the pill tint.
const PAYMENT_STATUS_COLORS: Record<PaymentStatus, ThemeColor> = {
  pending: 'warning',
  paid: 'success',
  refunded: 'textSecondary',
  cancelled: 'error',
};

// Human-readable labels shown inside the pill.
const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  pending: 'Pending',
  paid: 'Paid',
  refunded: 'Refunded',
  cancelled: 'Cancelled',
};

export type PaymentStatusBadgeProps = { status: PaymentStatus };

export function PaymentStatusBadge({ status }: PaymentStatusBadgeProps) {
  const theme = useTheme();
  const color = PAYMENT_STATUS_COLORS[status];

  return (
    <View style={[styles.pill, { backgroundColor: theme[color] + '22' }]}>
      <Text variant="caption" color={color}>
        {PAYMENT_STATUS_LABELS[status]}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    alignSelf: 'flex-start',
    borderRadius: Radii.pill,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.half,
  },
});
