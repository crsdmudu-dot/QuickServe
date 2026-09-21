/**
 * src/components/admin-web/operations/case-status-badge.tsx
 *
 * A small pill-shaped badge that displays a support case's lifecycle status.
 * Reads label + color from CASE_STATUSES option array (constants/operations.ts).
 * Mirrors the StatusBadge idiom from src/components/ui/status-badge.tsx.
 *
 * Props:
 *   status — the CaseStatus value to display.
 */

import { StyleSheet, View } from 'react-native';

import { Radii, Spacing, type ThemeColor } from '@/constants/theme';
import { CASE_STATUSES, type CaseStatus } from '@/constants/operations';
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

export type CaseStatusBadgeProps = {
  status: CaseStatus;
};

export function CaseStatusBadge({ status }: CaseStatusBadgeProps) {
  const theme = useTheme();
  const option = CASE_STATUSES.find((s) => s.id === status);
  const color: ThemeColor = option?.color ?? 'neutral500';
  const surfaceKey: ThemeColor = COLOR_TO_SURFACE[color] ?? 'surfaceMuted';

  return (
    <View style={[styles.pill, { backgroundColor: theme[surfaceKey] }]}>
      <Text variant="caption" color={color}>
        {option?.label ?? status}
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
