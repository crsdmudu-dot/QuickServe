/**
 * notification-priority-indicator.tsx — Colored dot or labeled chip for notification priority.
 *
 * low / normal  → subtle colored dot only (no label noise)
 * high / urgent → prominent colored dot + text label
 *
 * Uses PRIORITY_LEVELS from constants — no hardcoded colors.
 */

import { StyleSheet, View } from 'react-native';

import { Radii, Spacing } from '@/constants/theme';
import { PRIORITY_LEVELS, type NotificationPriority } from '@/constants/notifications';
import { Text } from '@/components/ui/text';

export type NotificationPriorityIndicatorProps = {
  priority: NotificationPriority;
};

/**
 * NotificationPriorityIndicator — subtle for low/normal, prominent for high/urgent.
 */
export function NotificationPriorityIndicator({ priority }: NotificationPriorityIndicatorProps) {
  const level = PRIORITY_LEVELS.find((l) => l.id === priority) ?? PRIORITY_LEVELS[1]; // fallback normal
  const isProminent = priority === 'high' || priority === 'urgent';

  if (isProminent) {
    // Show colored dot + text label for high/urgent
    return (
      <View style={styles.row}>
        <View
          testID={`priority-dot-${priority}`}
          style={[styles.dot, { backgroundColor: level.color }]}
        />
        <Text variant="caption" style={[styles.label, { color: level.color }]}>
          {level.label}
        </Text>
      </View>
    );
  }

  // Subtle: dot only for low/normal
  return (
    <View
      testID={`priority-dot-${priority}`}
      style={[styles.dot, { backgroundColor: level.color }]}
    />
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: Radii.pill,
  },
  label: {
    fontWeight: '500',
  },
});
