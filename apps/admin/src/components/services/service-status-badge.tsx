/**
 * service-status-badge.tsx
 *
 * A pill-shaped badge that communicates the 5 service lifecycle statuses.
 * Each status maps to a distinct label + theme color pair for at-a-glance clarity.
 *
 * Statuses and their colors:
 *   active   → success (green)
 *   draft    → textSecondary (neutral grey)
 *   hidden   → warning (amber)
 *   disabled → neutral500 (muted dark)
 *   archived → error (red-muted)
 */

import { StyleSheet, View } from 'react-native';

import { Text } from '@/components/ui/text';
import { Radii, Spacing, type ThemeColor } from '@/constants/theme';
import type { ServiceStatus } from '@/lib/services-catalog';
import { useTheme } from '@/hooks/use-theme';

// ── Per-status config ──────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<
  ServiceStatus,
  { label: string; textColor: ThemeColor; surfaceColor: ThemeColor }
> = {
  active:   { label: 'Active',   textColor: 'success',       surfaceColor: 'successSurface' },
  draft:    { label: 'Draft',    textColor: 'textSecondary',  surfaceColor: 'surfaceMuted' },
  hidden:   { label: 'Hidden',   textColor: 'warning',        surfaceColor: 'warningSurface' },
  disabled: { label: 'Disabled', textColor: 'textSecondary',  surfaceColor: 'backgroundElement' },
  archived: { label: 'Archived', textColor: 'error',          surfaceColor: 'errorSurface' },
};

// ── Component ─────────────────────────────────────────────────────────────────

export type ServiceStatusBadgeProps = {
  status: ServiceStatus;
};

export function ServiceStatusBadge({ status }: ServiceStatusBadgeProps) {
  const theme = useTheme();
  const config = STATUS_CONFIG[status] ?? STATUS_CONFIG.draft;

  return (
    <View
      style={[styles.pill, { backgroundColor: theme[config.surfaceColor] }]}
      testID={`service-status-badge-${status}`}>
      <Text variant="caption" color={config.textColor} weight="medium">
        {config.label}
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
