/**
 * notification-bell.tsx — Bell icon button with an unread count badge overlay.
 *
 * Fires onPress() when tapped — the SCREEN is responsible for routing to the
 * notifications center.  No navigation logic here.
 *
 * Accessibility: accessibilityRole="button" + label "Notifications, N unread"
 * (or "Notifications" when count is 0).
 */

import { Pressable, StyleSheet, Text as RNText, View } from 'react-native';

import { NotificationBadge } from '@/components/notifications/notification-badge';

export type NotificationBellProps = {
  /** Number of unread notifications; badge hidden when 0. */
  count: number;
  /** Called when the bell is pressed — let the screen handle routing. */
  onPress: () => void;
};

/**
 * NotificationBell — bell icon with optional unread badge.
 */
export function NotificationBell({ count, onPress }: NotificationBellProps) {
  const a11yLabel =
    count > 0 ? `Notifications, ${count} unread` : 'Notifications';

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={a11yLabel}
      hitSlop={8}
      style={({ pressed }) => [styles.container, pressed && styles.pressed]}
    >
      {/* Bell emoji / icon */}
      <RNText style={styles.bellIcon} testID="bell-icon">
        🔔
      </RNText>

      {/* Badge overlay */}
      {count > 0 && (
        <View style={styles.badgeContainer}>
          <NotificationBadge count={count} />
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: { opacity: 0.7 },
  bellIcon: {
    fontSize: 22,
    lineHeight: 26,
  },
  badgeContainer: {
    position: 'absolute',
    top: 4,
    right: 4,
  },
});
