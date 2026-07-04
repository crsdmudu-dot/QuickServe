/**
 * Notifications screen — shows the signed-in customer's in-app notifications.
 *
 * Loads notifications on mount via getMyNotifications().  Tapping a row marks
 * it as read and, if it has a booking_id, navigates to that booking's detail
 * screen.  A "Mark all read" button at the top marks every unread notification.
 */

import { router } from 'expo-router';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { usePaginatedList } from '@/hooks/use-paginated-list';
import {
  getMyNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  type AppNotification,
} from '@/lib/notifications';
import { LoadMoreButton } from '@/components/ui/load-more-button';
import { NotificationList } from '@/components/ui/notification-list';
import { Text } from '@/components/ui/text';

export default function CustomerNotificationsScreen() {
  const theme = useTheme();

  const {
    items: notifications,
    loading,
    hasMore,
    loadMore,
    reload,
  } = usePaginatedList((p, s) => getMyNotifications(p, s));

  async function handlePress(n: AppNotification) {
    await markNotificationRead(n.id);
    // Route-bearing rows are deep-linked by NotificationRow; only use the
    // booking fallback for legacy route-less notifications.
    if (!n.route) {
      if (n.booking_id) {
        router.push({ pathname: '/booking/[id]', params: { id: n.booking_id } });
      }
    }
  }

  async function handleMarkAll() {
    await markAllNotificationsRead();
    reload();
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text variant="title" style={styles.heading}>
          Notifications
        </Text>
        <NotificationList
          notifications={notifications}
          onPressItem={handlePress}
          onMarkAllRead={handleMarkAll}
        />
        <View style={styles.loadMore}>
          <LoadMoreButton onPress={loadMore} loading={loading} hasMore={hasMore} />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  heading: {
    paddingTop: Spacing.one,
    marginBottom: Spacing.four,
  },
  content: {
    padding: Spacing.four,
    paddingTop: Spacing.four,
  },
  loadMore: {
    marginTop: Spacing.two,
  },
});
