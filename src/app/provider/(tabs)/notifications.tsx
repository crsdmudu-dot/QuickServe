/**
 * Provider Notifications screen — shows the signed-in provider's in-app notifications.
 *
 * Loads notifications on mount via getMyNotifications() (RLS-scoped to the
 * signed-in provider).  Tapping a card marks it read and deep-links via
 * resolveNotificationDeepLink (booking types fall back to /provider/job/:id).
 * A filter bar narrows the DISPLAYED list (client-side view only — the full
 * history is always loaded).  A "Mark all read" button marks every unread
 * notification.  An unread badge shows the current unread count in the header.
 */

import { useCallback, useEffect, useState } from 'react';
import { Href, router } from 'expo-router';
import {
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Spacing } from '@/constants/theme';
import {
  NOTIFICATION_FILTERS,
  type NotificationFilter,
  resolveNotificationDeepLink,
} from '@/constants/notifications';
import { useTheme } from '@/hooks/use-theme';
import {
  getMyNotifications,
  getUnreadNotificationCount,
  filterNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  type AppNotification,
} from '@/lib/notifications';
import { Text } from '@/components/ui/text';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { NotificationGroupedList } from '@/components/notifications/notification-grouped-list';
import { NotificationEmptyState } from '@/components/notifications/notification-empty-state';
import { NotificationBadge } from '@/components/notifications/notification-badge';

export default function ProviderNotificationsScreen() {
  const theme = useTheme();

  // ── Notification list (reload pattern preserved) ───────────────────────────
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [listLoading, setListLoading] = useState(false);

  const reload = useCallback(() => {
    setListLoading(true);
    getMyNotifications()
      .then(setNotifications)
      .finally(() => setListLoading(false));
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  // ── Filter chip state (client-side view only — does NOT suppress history) ──
  const [filter, setFilter] = useState<NotificationFilter>('all');

  // ── Unread badge count ──────────────────────────────────────────────────────
  const [unreadCount, setUnreadCount] = useState(0);

  async function refreshUnread() {
    const count = await getUnreadNotificationCount();
    setUnreadCount(count);
  }

  useEffect(() => {
    void refreshUnread();
  }, []);

  // ── Computed filtered list (pure, client-side) ─────────────────────────────
  const shown = filterNotifications(notifications, filter);

  // ── Handlers ───────────────────────────────────────────────────────────────

  async function handlePress(n: AppNotification) {
    // Marking read updates is_read + read_at ONLY (via lib) — does NOT delete.
    await markNotificationRead(n.id);
    void refreshUnread();
    const route = resolveNotificationDeepLink(n);
    if (route) {
      router.push(route as Href);
    } else if (n.booking_id) {
      // Provider-specific fallback for booking notifications that lack a route column
      router.push({ pathname: '/provider/job/[id]', params: { id: n.booking_id } });
    }
  }

  async function handleMarkAll() {
    await markAllNotificationsRead();
    reload();
    void refreshUnread();
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* Header row: title + unread badge */}
        <View style={styles.headerRow}>
          <View style={styles.headerLeft}>
            <Text variant="title">Notifications</Text>
            {unreadCount > 0 && (
              <View style={styles.badgeWrap}>
                <NotificationBadge count={unreadCount} />
              </View>
            )}
          </View>
          <Button label="Mark all read" variant="ghost" onPress={handleMarkAll} />
        </View>

        {/* Filter chips */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterRow}
        >
          {NOTIFICATION_FILTERS.map((f) => {
            const active = filter === f.id;
            return (
              <TouchableOpacity
                key={f.id}
                onPress={() => setFilter(f.id)}
                accessibilityRole="button"
                accessibilityLabel={f.label}
                style={[
                  styles.chip,
                  {
                    backgroundColor: active ? theme.primary : theme.surface,
                    borderColor: active ? theme.primary : theme.border,
                  },
                ]}
              >
                <Text
                  variant="caption"
                  style={{ color: active ? '#FFFFFF' : theme.textSecondary }}
                  weight={active ? 'semibold' : 'regular'}
                >
                  {f.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {/* Loading skeleton on initial load */}
        {listLoading && notifications.length === 0 ? (
          <View style={styles.skeletons}>
            <Skeleton height={80} radius={12} />
            <Skeleton height={80} radius={12} />
            <Skeleton height={80} radius={12} />
          </View>
        ) : shown.length === 0 ? (
          <NotificationEmptyState
            variant={
              filter === 'unread' ? 'unread' : filter === 'all' ? 'all' : 'filtered'
            }
          />
        ) : (
          <NotificationGroupedList notifications={shown} onPressItem={handlePress} />
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  content: {
    padding: Spacing.four,
    paddingTop: Spacing.four,
    gap: Spacing.four,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  badgeWrap: {
    marginLeft: Spacing.one,
  },
  filterRow: {
    gap: Spacing.two,
    paddingRight: Spacing.two,
  },
  chip: {
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.one + 2,
    borderRadius: 20,
    borderWidth: 1,
  },
  skeletons: {
    gap: Spacing.three,
  },
});
