/**
 * PaymentStatusBadge — a small pill-shaped label that communicates the
 * current payment status at a glance.  Background uses semantic SURFACE tokens
 * and text uses the matching semantic color token for clean, token-driven tinting.
 */

import { StyleSheet, View } from 'react-native';

import { Radii, Spacing, type ThemeColor } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { Text } from '@/components/ui/text';
import type { PaymentStatus } from '@/lib/payments';

// Map each status to the theme token that controls the pill text color.
const PAYMENT_STATUS_COLORS: Record<PaymentStatus, ThemeColor> = {
  pending: 'warning',
  paid: 'success',
  refunded: 'textSecondary',
  cancelled: 'error',
};

// Maps the semantic color tokens to their surface variant for the background.
const COLOR_TO_SURFACE: Partial<Record<ThemeColor, ThemeColor>> = {
  success: 'successSurface',
  warning: 'warningSurface',
  error: 'errorSurface',
  primary: 'primarySurface',
  textSecondary: 'surfaceMuted',
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
  const surfaceKey: ThemeColor = COLOR_TO_SURFACE[color] ?? 'surfaceMuted';

  return (
    <View style={[styles.pill, { backgroundColor: theme[surfaceKey] }]}>
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
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.one,
  },
});
