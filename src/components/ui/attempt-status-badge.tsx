/**
 * AttemptStatusBadge — a small pill-shaped label that communicates the
 * current payment attempt status at a glance.  Background uses semantic SURFACE
 * tokens and text uses the matching semantic color token for clean, token-driven
 * tinting.
 */

import { StyleSheet, View } from 'react-native';

import { Radii, Spacing, type ThemeColor } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { Text } from '@/components/ui/text';
import type { AttemptStatus } from '@/lib/attempts';

// Map each status to the theme token that controls the pill text color.
const ATTEMPT_STATUS_COLORS: Record<AttemptStatus, ThemeColor> = {
  initiated: 'warning',
  pending: 'warning',
  successful: 'success',
  failed: 'error',
  cancelled: 'textSecondary',
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
  const surfaceKey: ThemeColor = COLOR_TO_SURFACE[color] ?? 'surfaceMuted';

  return (
    <View style={[styles.pill, { backgroundColor: theme[surfaceKey] }]}>
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
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.one,
  },
});
