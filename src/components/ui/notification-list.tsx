// notification-list.tsx — Renders the full list of notifications with optional "Mark all read".
import { StyleSheet, View } from 'react-native';

import { Spacing } from '@/constants/theme';
import { type AppNotification } from '@/lib/notifications';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { NotificationRow } from '@/components/ui/notification-row';

export type NotificationListProps = {
  notifications: AppNotification[];
  onPressItem: (notification: AppNotification) => void;
  onMarkAllRead?: () => void;
};

/**
 * NotificationList — shows an EmptyState when there are no notifications,
 * or a list of NotificationRow items.  An optional "Mark all read" ghost
 * button appears at the top when onMarkAllRead is provided.
 */
export function NotificationList({ notifications, onPressItem, onMarkAllRead }: NotificationListProps) {
  if (notifications.length === 0) {
    return (
      <EmptyState
        icon="🔔"
        title="No notifications"
        message="You're all caught up!"
      />
    );
  }

  return (
    <View style={styles.container}>
      {/* "Mark all read" button — only shown when a handler is provided */}
      {onMarkAllRead ? (
        <View style={styles.actions}>
          <Button label="Mark all read" variant="ghost" onPress={onMarkAllRead} />
        </View>
      ) : null}

      {/* Notification rows */}
      {notifications.map((notification) => (
        <NotificationRow
          key={notification.id}
          notification={notification}
          onPress={() => onPressItem(notification)}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: Spacing.two,
  },
  actions: {
    alignItems: 'flex-end',
    marginBottom: Spacing.one,
  },
});
