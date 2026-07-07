/**
 * notification-badge.tsx — Small count pill for notification counts.
 *
 * Renders nothing when count <= 0.
 * Caps display at "99+" for large counts.
 */

import { StyleSheet, View } from 'react-native';

import { Radii, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { Text } from '@/components/ui/text';

export type NotificationBadgeProps = {
  count: number;
};

/**
 * NotificationBadge — pill-shaped count indicator.
 * Hidden when count <= 0; shows "99+" when count > 99.
 */
export function NotificationBadge({ count }: NotificationBadgeProps) {
  const theme = useTheme();

  if (count <= 0) return null;

  const label = count > 99 ? '99+' : String(count);

  return (
    <View
      testID="notification-badge"
      style={[styles.pill, { backgroundColor: theme.error }]}
    >
      <Text variant="caption" style={[styles.text, { color: '#FFFFFF' }]}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    minWidth: 18,
    height: 18,
    borderRadius: Radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.one,
  },
  text: {
    fontSize: 10,
    lineHeight: 14,
    fontWeight: '700',
  },
});
