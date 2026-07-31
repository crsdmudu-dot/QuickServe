/**
 * admin-shell.tsx
 *
 * Full-page layout wrapper for the web admin panel.
 *
 * Layout — Desktop (width ≥ AdminBreakpoints.wide):
 *   ┌───────────────┬──────────────────────────────────┐
 *   │ AdminSidebar  │  top-bar  (title | rightSlot)    │
 *   │  (side nav)   │──────────────────────────────────│
 *   │               │  <ScrollView> children           │
 *   └───────────────┴──────────────────────────────────┘
 *
 * Layout — Tablet / narrow (width < AdminBreakpoints.wide):
 *   ┌──────────────────────────────────────────────────┐
 *   │ AdminSidebar orientation="top"  (horiz. nav row) │
 *   ├──────────────────────────────────────────────────┤
 *   │  top-bar  (title | rightSlot)                    │
 *   ├──────────────────────────────────────────────────┤
 *   │  <ScrollView> children                           │
 *   └──────────────────────────────────────────────────┘
 *
 * The top-bar always includes an AdminNotificationBell (T5) that shows the
 * admin's unread count and navigates to /(admin-web)/notifications on press.
 *
 * RN/RN-web safe — no DOM-only APIs.
 */

import { useEffect, useState, type ReactNode } from 'react';
import { ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { router, type Href } from 'expo-router';

import { AdminSidebar } from '@/components/admin-web/admin-sidebar';
import { NotificationBell } from '@/components/notifications/notification-bell';
import { Text } from '@/components/ui/text';
import { AdminBreakpoints } from '@/constants/admin-web';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { getUnreadNotificationCount } from '@/lib/notifications';

// ── Types ──────────────────────────────────────────────────────────────────

export type AdminShellProps = {
  /** Page title shown in the top bar. */
  title: string;
  /** Optional element rendered at the right end of the top bar (e.g. action buttons). */
  rightSlot?: ReactNode;
  children: ReactNode;
  /**
   * Whether to render the admin chrome (sidebar + top bar + notification bell). When
   * false the shell renders only its children in the same position — used by the
   * (admin-web) guard to keep the navigator (<Slot/>) mounted at a STABLE position while
   * a user is loading / not an authorized admin, WITHOUT exposing admin navigation.
   * Children stay at the same index whether or not the chrome is shown, so toggling this
   * never remounts the navigator subtree. Defaults to true.
   */
  showChrome?: boolean;
};

// ── Component ──────────────────────────────────────────────────────────────

export function AdminShell({ title, rightSlot, children, showChrome = true }: AdminShellProps) {
  const theme = useTheme();
  const { width } = useWindowDimensions();

  // Desktop: side-by-side sidebar + content.
  // Tablet/narrow: compact horizontal top-nav stacked above content.
  const isWide = width >= AdminBreakpoints.wide;

  // ── Admin notification bell unread count ──────────────────────────────
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    if (!showChrome) return; // no bell rendered → don't issue the admin-only count query
    let mounted = true;
    getUnreadNotificationCount()
      .then((count) => { if (mounted) setUnreadCount(count); })
      .catch(() => { /* silent — bell shows 0 on error */ });
    return () => { mounted = false; };
  }, [showChrome]);

  function handleBellPress() {
    // Navigate to the admin notifications center
    router.push('/(admin-web)/notifications' as Href);
  }

  return (
    <View style={[styles.root, { backgroundColor: theme.background }]}>
      {/* Desktop side navigation (index 0 — becomes an empty slot when chrome hidden,
          so the content column below keeps its position and the navigator is preserved). */}
      {showChrome && isWide && <AdminSidebar orientation="side" />}

      {/* Main content column */}
      <View style={[styles.content, { backgroundColor: theme.surface }]}>
        {/* Tablet / narrow horizontal top nav */}
        {showChrome && !isWide && <AdminSidebar orientation="top" />}

        {/* Top bar — title + notification bell + optional right slot */}
        {showChrome && (
          <View style={[styles.topBar, { borderBottomColor: theme.border }]}>
            <Text variant="title" color="text" style={styles.titleText}>
              {title}
            </Text>
            {/* Admin notification bell — always present in the top bar */}
            <NotificationBell
              count={unreadCount}
              onPress={handleBellPress}
            />
            {rightSlot ? <View style={styles.rightSlot}>{rightSlot}</View> : null}
          </View>
        )}

        {/* Scrollable page body constrained to MaxContentWidth. Kept at a stable index
            (last child of the content column) regardless of `showChrome` so the navigator
            subtree it contains is never destroyed/recreated by an auth-state change. */}
        <ScrollView
          style={styles.scrollArea}
          contentContainerStyle={[
            styles.scrollContent,
            { maxWidth: MaxContentWidth },
          ]}
          showsVerticalScrollIndicator={false}>
          {children}
        </ScrollView>
      </View>
    </View>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: {
    flex: 1,
    flexDirection: 'row',
  },
  content: {
    flex: 1,
    flexDirection: 'column',
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.three,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: Spacing.three,
  },
  titleText: {
    flex: 1,
  },
  rightSlot: {
    flexShrink: 0,
  },
  scrollArea: {
    flex: 1,
  },
  scrollContent: {
    alignSelf: 'center',
    width: '100%',
    padding: Spacing.four,
    gap: Spacing.three,
  },
});
