/**
 * StatusBadge — a small pill-shaped label that communicates the current
 * booking status at a glance.  Background and text color are driven by
 * STATUS_COLORS so the badge always matches the design-token palette.
 */

import { StyleSheet, View } from 'react-native';

import { Radii, Spacing } from '@/constants/theme';
import { type BookingStatus, STATUS_COLORS, STATUS_LABELS } from '@/constants/booking-status';
import { useTheme } from '@/hooks/use-theme';
import { Text } from '@/components/ui/text';

export type StatusBadgeProps = {
  status: BookingStatus;
};

export function StatusBadge({ status }: StatusBadgeProps) {
  const theme = useTheme();
  const color = STATUS_COLORS[status];

  return (
    <View style={[styles.pill, { backgroundColor: theme[color] + '22' }]}>
      <Text variant="caption" color={color}>
        {STATUS_LABELS[status]}
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
