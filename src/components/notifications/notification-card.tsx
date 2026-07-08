/**
 * notification-card.tsx — A single notification displayed as a pressable card.
 *
 * Shows: icon (from notificationMeta), title, body, category label,
 * priority indicator, unread dot, and a formatted created_at time.
 *
 * Tapping fires onPress(notification) — the SCREEN handles mark-read and
 * deep-link routing.  No push, no navigation, no mark-read logic here.
 */

import { StyleSheet, Text as RNText, View } from 'react-native';

import { Radii, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { type AppNotification } from '@/lib/notifications';
import {
  CATEGORY_LABELS,
  type NotificationCategory,
  notificationMeta,
} from '@/constants/notifications';
import { Card } from '@/components/ui/card';
import { Text } from '@/components/ui/text';
import { NotificationPriorityIndicator } from '@/components/notifications/notification-priority-indicator';

// ── Pure time formatter ──────────────────────────────────────────────────────

/**
 * PURE — formats a notification timestamp relative to `now`.
 *   - Same day   → time like "3:45 PM"
 *   - Yesterday  → "Yesterday"
 *   - Older      → short date like "Jul 3"
 *
 * Accepts an optional `now` so tests can pass a fixed reference time
 * (deterministic — no hidden Date.now() calls when `now` is provided).
 */
export function formatNotificationTime(createdAt: string, now?: Date): string {
  const ref = now ?? new Date();
  const date = new Date(createdAt);

  // Midnight boundaries
  const todayStart = new Date(ref);
  todayStart.setHours(0, 0, 0, 0);

  const yesterdayStart = new Date(todayStart);
  yesterdayStart.setDate(yesterdayStart.getDate() - 1);

  if (date >= todayStart) {
    // Today → show time only, e.g. "3:45 PM"
    return date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  }

  if (date >= yesterdayStart) {
    return 'Yesterday';
  }

  // Older → short date like "Jul 3"
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

// ── Component ────────────────────────────────────────────────────────────────

export type NotificationCardProps = {
  notification: AppNotification;
  onPress?: (n: AppNotification) => void;
};

/**
 * NotificationCard — presentational card for one notification.
 *
 * Unread cards: solid surfaceMuted background + unread dot (testID "unread-dot").
 * Read cards: reduced opacity (visually muted).
 */
export function NotificationCard({ notification, onPress }: NotificationCardProps) {
  const theme = useTheme();
  const { title, body, is_read, created_at, type, priority } = notification;

  const meta = notificationMeta(type ?? 'generic');
  const categoryLabel =
    CATEGORY_LABELS[(notification.category as NotificationCategory) ?? meta.category] ??
    meta.category;
  const effectivePriority = priority ?? meta.defaultPriority;
  const timeLabel = formatNotificationTime(created_at);

  function handlePress() {
    onPress?.(notification);
  }

  return (
    <Card
      onPress={handlePress}
      elevation="e1"
      style={[
        is_read ? styles.dimmed : undefined,
        !is_read ? { backgroundColor: theme.surfaceMuted } : undefined,
      ]}
    >
      <View style={styles.row}>
        {/* Type icon */}
        <RNText style={styles.icon}>{meta.icon}</RNText>

        {/* Main content */}
        <View style={styles.content}>
          {/* Header row: title + time */}
          <View style={styles.headerRow}>
            <Text variant="label" style={styles.titleFlex} numberOfLines={1}>
              {title}
            </Text>
            <Text variant="caption" color="textTertiary" style={styles.time}>
              {timeLabel}
            </Text>
          </View>

          {/* Body */}
          <Text variant="body" color="textSecondary" numberOfLines={2}>
            {body}
          </Text>

          {/* Footer row: category label + priority */}
          <View style={styles.footerRow}>
            <View style={[styles.categoryPill, { backgroundColor: theme.primarySurface }]}>
              <Text variant="caption" color="primary">
                {categoryLabel}
              </Text>
            </View>
            <NotificationPriorityIndicator priority={effectivePriority} />
          </View>
        </View>

        {/* Unread dot — right-aligned */}
        {!is_read && (
          <View
            testID="unread-dot"
            style={[styles.dot, { backgroundColor: theme.primary }]}
          />
        )}
      </View>
    </Card>
  );
}

// ── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  dimmed: { opacity: 0.6 },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.two,
  },
  icon: {
    fontSize: 24,
    lineHeight: 28,
    marginTop: 2,
  },
  content: {
    flex: 1,
    gap: Spacing.one,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
  },
  titleFlex: {
    flex: 1,
  },
  time: {
    flexShrink: 0,
  },
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    marginTop: Spacing.one,
  },
  categoryPill: {
    alignSelf: 'flex-start',
    borderRadius: Radii.pill,
    paddingHorizontal: Spacing.two,
    paddingVertical: 2,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: Radii.pill,
    marginTop: Spacing.two,
    flexShrink: 0,
  },
});
