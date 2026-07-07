/**
 * src/app/(admin-web)/notifications/index.tsx — Admin Notifications Center
 *
 * Enhanced (Task 5):
 *   - Filter bar: All / Unread / Booking / Payments / Promotions / System
 *   - Unread count badge (refreshed after mark-all)
 *   - Mark all read
 *   - Grouped view (Today / Yesterday / Earlier) via NotificationGroupedList
 *   - Tap → markNotificationRead + resolveNotificationDeepLink routing
 *   - Link to Broadcast composer
 *
 * Wrapped by AdminShell via the (admin-web)/_layout.tsx — this screen only
 * needs to return its content (no Shell wrapper here).
 *
 * Reuses: getMyNotifications, getUnreadNotificationCount, filterNotifications,
 * markNotificationRead, markAllNotificationsRead (T2); NOTIFICATION_FILTERS,
 * resolveNotificationDeepLink (constants/notifications); NotificationGroupedList,
 * NotificationEmptyState, NotificationBadge (T3).
 *
 * NO push, NO email/SMS send, NO second pipeline. Mark-read = is_read+read_at only.
 */

import { useCallback, useEffect, useState } from 'react';
import { ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { Href, router } from 'expo-router';

import { PageMeta } from '@/components/admin-web/page-meta';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { usePaginatedList } from '@/hooks/use-paginated-list';
import {
  NOTIFICATION_FILTERS,
  type NotificationFilter,
  resolveNotificationDeepLink,
} from '@/constants/notifications';
import {
  getMyNotifications,
  getUnreadNotificationCount,
  filterNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  type AppNotification,
} from '@/lib/notifications';
import { NotificationGroupedList } from '@/components/notifications/notification-grouped-list';
import { NotificationEmptyState } from '@/components/notifications/notification-empty-state';
import { NotificationBadge } from '@/components/notifications/notification-badge';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

// ── Screen ──────────────────────────────────────────────────────────────────

export default function AdminWebNotificationsScreen() {
  const theme = useTheme();

  // ── Paginated notification list ──────────────────────────────────────────
  const {
    items: allNotifications,
    loading,
    error: loadError,
    hasMore,
    loadMore,
    reload,
  } = usePaginatedList((p, s) => getMyNotifications(p, s));

  // ── Filter chip state ────────────────────────────────────────────────────
  const [filter, setFilter] = useState<NotificationFilter>('all');

  // ── Unread count ─────────────────────────────────────────────────────────
  const [unreadCount, setUnreadCount] = useState(0);

  const refreshUnread = useCallback(async () => {
    const count = await getUnreadNotificationCount();
    setUnreadCount(count);
  }, []);

  useEffect(() => {
    void refreshUnread();
  }, [refreshUnread]);

  // ── Computed filtered list (pure, client-side) ───────────────────────────
  const shown = filterNotifications(allNotifications, filter);

  // ── Handlers ─────────────────────────────────────────────────────────────

  async function handlePress(n: AppNotification) {
    // Mark read = is_read + read_at only (via lib). No delete, no history mutation.
    await markNotificationRead(n.id);
    void refreshUnread();
    const route = resolveNotificationDeepLink(n);
    if (route) {
      router.push(route as Href);
    }
  }

  async function handleMarkAll() {
    await markAllNotificationsRead();
    reload();
    void refreshUnread();
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <>
      <PageMeta
        title="Notifications"
        description="Operational alerts and announcements for admins."
      />

      {/* ── Header row: title + unread badge + mark-all + broadcast link ── */}
      <View style={styles.headerRow}>
        <View style={styles.headerLeft}>
          <Text variant="heading" color="text" weight="semibold">
            Notifications
          </Text>
          {unreadCount > 0 && (
            <View style={styles.badgeWrap}>
              <NotificationBadge count={unreadCount} />
            </View>
          )}
        </View>
        <View style={styles.headerActions}>
          <Button
            label="Mark all read"
            variant="ghost"
            size="md"
            onPress={() => void handleMarkAll()}
          />
          <Button
            label="Broadcast"
            variant="secondary"
            size="md"
            onPress={() => router.push('/(admin-web)/broadcast' as Href)}
          />
        </View>
      </View>

      {/* ── Filter chips ──────────────────────────────────────────────────── */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filterRow}
        style={styles.filterScroll}
      >
        {NOTIFICATION_FILTERS.map((f) => {
          const active = filter === f.id;
          return (
            <TouchableOpacity
              key={f.id}
              testID={`filter-chip-${f.id}`}
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

      {/* ── Notification list ─────────────────────────────────────────────── */}
      {loadError ? (
        <View style={styles.errorRow}>
          <Text variant="body" color="error">
            Could not load notifications.
          </Text>
          <Button label="Retry" variant="ghost" size="md" onPress={reload} />
        </View>
      ) : shown.length === 0 && !loading ? (
        <NotificationEmptyState
          variant={
            filter === 'unread' ? 'unread' : filter === 'all' ? 'all' : 'filtered'
          }
        />
      ) : (
        <NotificationGroupedList notifications={shown} onPressItem={handlePress} />
      )}

      {/* ── Load more ─────────────────────────────────────────────────────── */}
      {hasMore && (
        <Button
          label={loading ? 'Loading…' : 'Load more'}
          variant="ghost"
          size="md"
          onPress={loadMore}
          disabled={loading}
        />
      )}
    </>
  );
}

// ── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: Spacing.two,
    marginBottom: Spacing.three,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  badgeWrap: {
    marginLeft: Spacing.one,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  filterScroll: {
    marginBottom: Spacing.three,
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
  errorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
});
