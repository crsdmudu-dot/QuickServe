/**
 * src/components/admin-web/operations/case-priority-badge.tsx
 *
 * A small pill-shaped badge that displays a support case's priority level.
 * Reads label + color from CASE_PRIORITIES option array (constants/operations.ts).
 * Mirrors the CaseStatusBadge / StatusBadge idiom.
 *
 * Props:
 *   priority — the CasePriority value to display.
 */

import { StyleSheet, View } from 'react-native';

import { Radii, Spacing, type ThemeColor } from '@/constants/theme';
import { CASE_PRIORITIES, type CasePriority } from '@/constants/operations';
import { useTheme } from '@/hooks/use-theme';
import { Text } from '@/components/ui/text';

// Maps semantic color tokens to their surface (background) variant.
const COLOR_TO_SURFACE: Partial<Record<ThemeColor, ThemeColor>> = {
  success:       'successSurface',
  warning:       'warningSurface',
  error:         'errorSurface',
  primary:       'primarySurface',
  info:          'infoSurface',
  textSecondary: 'surfaceMuted',
  neutral500:    'surfaceMuted',
};

export type CasePriorityBadgeProps = {
  priority: CasePriority;
};

export function CasePriorityBadge({ priority }: CasePriorityBadgeProps) {
  const theme = useTheme();
  const option = CASE_PRIORITIES.find((p) => p.id === priority);
  const color: ThemeColor = option?.color ?? 'neutral500';
  const surfaceKey: ThemeColor = COLOR_TO_SURFACE[color] ?? 'surfaceMuted';

  return (
    <View style={[styles.pill, { backgroundColor: theme[surfaceKey] }]}>
      <Text variant="caption" color={color}>
        {option?.label ?? priority}
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
