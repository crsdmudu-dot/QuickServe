/**
 * AttemptStatusBadge — a small pill-shaped label that communicates the
 * current payment attempt status at a glance.  Mirrors PaymentStatusBadge
 * exactly but maps the five AttemptStatus values to their own colors and labels.
 */

import { StyleSheet, View } from 'react-native';

import { Radii, Spacing, type ThemeColor } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { Text } from '@/components/ui/text';
import type { AttemptStatus } from '@/lib/attempts';

// Map each status to the theme token that controls the pill tint.
const ATTEMPT_STATUS_COLORS: Record<AttemptStatus, ThemeColor> = {
  initiated: 'warning',
  pending: 'warning',
  successful: 'success',
  failed: 'error',
  cancelled: 'textSecondary',
};

// Human-readable labels shown inside the pill.
const ATTEMPT_STATUS_LABELS: Record<AttemptStatus, string> = {
  initiated: 'Initiated',
  pending: 'Pending',
  successful: 'Successful',
  failed: 'Failed',
  cancelled: 'Cancelled',
};

export type AttemptStatusBadgeProps = { status: AttemptStatus };

export function AttemptStatusBadge({ status }: AttemptStatusBadgeProps) {
  const theme = useTheme();
  const color = ATTEMPT_STATUS_COLORS[status];

  return (
    <View style={[styles.pill, { backgroundColor: theme[color] + '22' }]}>
      <Text variant="caption" color={color}>
        {ATTEMPT_STATUS_LABELS[status]}
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
