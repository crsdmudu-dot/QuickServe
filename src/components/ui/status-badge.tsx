/**
 * StatusBadge — a small pill-shaped label that communicates the current
 * booking status at a glance.  Background uses semantic SURFACE tokens and
 * text uses the matching semantic color token for clean, token-driven tinting.
 */

import { StyleSheet, View } from 'react-native';

import { Radii, Spacing, type ThemeColor } from '@/constants/theme';
import { type BookingStatus, STATUS_COLORS, STATUS_LABELS } from '@/constants/booking-status';
import { useTheme } from '@/hooks/use-theme';
import { Text } from '@/components/ui/text';

// Maps the semantic color tokens used by STATUS_COLORS to their surface variant.
const COLOR_TO_SURFACE: Partial<Record<ThemeColor, ThemeColor>> = {
  success: 'successSurface',
  warning: 'warningSurface',
  error: 'errorSurface',
  primary: 'primarySurface',
  textSecondary: 'surfaceMuted',
};

export type StatusBadgeProps = {
  status: BookingStatus;
};

export function StatusBadge({ status }: StatusBadgeProps) {
  const theme = useTheme();
  const color = STATUS_COLORS[status];
  const surfaceKey: ThemeColor = COLOR_TO_SURFACE[color] ?? 'surfaceMuted';

  return (
    <View style={[styles.pill, { backgroundColor: theme[surfaceKey] }]}>
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
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.one,
  },
});
