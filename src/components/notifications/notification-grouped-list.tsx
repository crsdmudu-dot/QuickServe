/**
 * notification-grouped-list.tsx — Grouped notification list with Today/Yesterday/Earlier sections.
 *
 * Uses groupNotificationsByDate() from lib/notifications to bucket items.
 * Empty buckets are omitted. Empty list → NotificationEmptyState.
 *
 * Fires onPressItem(notification) for each card tap — the SCREEN handles
 * mark-read and deep-link routing.
 */

import { StyleSheet, View } from 'react-native';

import { Spacing } from '@/constants/theme';
import { type AppNotification, groupNotificationsByDate } from '@/lib/notifications';
import { SectionHeader } from '@/components/ui/section-header';
import { NotificationCard } from '@/components/notifications/notification-card';
import { NotificationEmptyState } from '@/components/notifications/notification-empty-state';

export type NotificationGroupedListProps = {
  notifications: AppNotification[];
  onPressItem?: (n: AppNotification) => void;
};

/**
 * NotificationGroupedList — renders grouped sections (Today / Yesterday / Earlier).
 * Shows NotificationEmptyState when the list is empty.
 */
export function NotificationGroupedList({
  notifications,
  onPressItem,
}: NotificationGroupedListProps) {
  if (notifications.length === 0) {
    return <NotificationEmptyState variant="all" />;
  }

  const groups = groupNotificationsByDate(notifications);

  return (
    <View style={styles.container}>
      {groups.map((group) => (
        <View key={group.label} style={styles.section}>
          <SectionHeader title={group.label} />
          <View style={styles.cards}>
            {group.items.map((notification) => (
              <NotificationCard
                key={notification.id}
                notification={notification}
                onPress={onPressItem}
              />
            ))}
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: Spacing.four,
  },
  section: {
    gap: Spacing.two,
  },
  cards: {
    gap: Spacing.two,
  },
});
