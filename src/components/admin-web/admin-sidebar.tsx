/**
 * admin-sidebar.tsx
 *
 * Persistent navigation for the web admin panel.
 *
 * Orientations:
 *   'side' (default) — fixed 240 px left column (desktop)
 *   'top'            — horizontal scrollable row pinned above content (tablet/narrow)
 *
 * RN/RN-web safe — uses only View, Pressable, ScrollView from react-native.
 */

import { useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { router, useSegments, type Href } from 'expo-router';

import { useAuth } from '@/auth/auth-context';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { Radii, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

// ── Nav item definition ────────────────────────────────────────────────────

type NavItem = {
  label: string;
  route: string;
  /** The segment that appears in useSegments() when this item is active. */
  segment: string;
};

const NAV_ITEMS: NavItem[] = [
  { label: 'Dashboard', route: '/(admin-web)', segment: '(admin-web)' },
  { label: 'Bookings', route: '/(admin-web)/bookings', segment: 'bookings' },
  { label: 'Providers', route: '/(admin-web)/providers', segment: 'providers' },
  { label: 'Customers', route: '/(admin-web)/customers', segment: 'customers' },
  { label: 'Payments', route: '/(admin-web)/payments', segment: 'payments' },
  { label: 'Payment Attempts', route: '/(admin-web)/payment-attempts', segment: 'payment-attempts' },
  { label: 'Earnings & Payouts', route: '/(admin-web)/earnings', segment: 'earnings' },
  { label: 'Reviews', route: '/(admin-web)/reviews', segment: 'reviews' },
  { label: 'Notifications', route: '/(admin-web)/notifications', segment: 'notifications' },
  { label: 'Promotions', route: '/(admin-web)/promos', segment: 'promos' },
  { label: 'Analytics', route: '/(admin-web)/analytics', segment: 'analytics' },
];

// ── Props ──────────────────────────────────────────────────────────────────

export type AdminSidebarProps = {
  /**
   * 'side' (default) — vertical column fixed to the left edge (desktop).
   * 'top'            — horizontal row pinned above the content (tablet/narrow).
   */
  orientation?: 'side' | 'top';
};

// ── Web focus ring helper ──────────────────────────────────────────────────
// We use onFocus/onBlur + a state bit because Pressable's render-prop arg
// does not include `focused` on the RN types. On native the ring style is a
// no-op (outline is ignored by the native renderer).
const focusRingStyle =
  Platform.OS === 'web'
    ? // RN-web merges plain objects into the DOM element's style.
      // `outlineColor` is set dynamically per-item in the render function.
      ({ outlineWidth: 2, outlineStyle: 'solid', outlineOffset: 2 } as object)
    : {};

// ── Sub-component: single focusable nav item ───────────────────────────────

type NavItemButtonProps = {
  item: NavItem;
  active: boolean;
  style?: object;
  itemStyle: object;
  textColor: 'primary' | 'textSecondary';
  textWeight: 'semibold' | 'medium';
  focusOutlineColor: string;
};

function NavItemButton({
  item,
  active,
  style,
  itemStyle,
  textColor,
  textWeight,
  focusOutlineColor,
}: NavItemButtonProps) {
  const theme = useTheme();
  const [focused, setFocused] = useState(false);

  return (
    <Pressable
      key={item.label}
      accessibilityRole="button"
      accessibilityLabel={item.label}
      accessibilityState={{ selected: active }}
      onPress={() => router.push(item.route as Href)}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      style={({ pressed }) => [
        itemStyle,
        style,
        active && { backgroundColor: theme.primaryTint },
        pressed && !active && { backgroundColor: theme.backgroundElement },
        focused && { ...focusRingStyle, outlineColor: focusOutlineColor },
      ]}>
      <Text variant="label" color={textColor} weight={textWeight}>
        {item.label}
      </Text>
    </Pressable>
  );
}

// ── Component ──────────────────────────────────────────────────────────────

export function AdminSidebar({ orientation = 'side' }: AdminSidebarProps) {
  const theme = useTheme();
  const segments = useSegments();
  const { session, signOut } = useAuth();

  const email = session?.user?.email ?? 'Admin';

  /**
   * An item is active when its segment appears anywhere in the current
   * segments array. For the Dashboard (segment "(admin-web)") we also
   * check that the segments array length is exactly 1 (root of the group)
   * so it doesn't stay highlighted on deeper routes.
   *
   * We cast `segments` to `string[]` so the generic comparison works
   * regardless of the typed union that expo-router infers for each app.
   */
  function isActive(item: NavItem): boolean {
    const segs = segments as string[];
    if (item.segment === '(admin-web)') {
      // Active only at the root index of the group.
      return segs.length === 1 && segs[0] === '(admin-web)';
    }
    return segs.includes(item.segment);
  }

  // ── Top (horizontal) layout ──────────────────────────────────────────────
  if (orientation === 'top') {
    return (
      <View
        style={[
          styles.topBar,
          {
            backgroundColor: theme.surface,
            borderBottomColor: theme.border,
          },
        ]}>
        {/* Brand — compact */}
        <View style={styles.topBrand}>
          <Text variant="label" color="primary" weight="bold">
            QuickServe
          </Text>
        </View>

        {/* Nav items — horizontal scroll */}
        <ScrollView
          horizontal
          style={styles.topNavScroll}
          contentContainerStyle={styles.topNavContent}
          showsHorizontalScrollIndicator={false}>
          {NAV_ITEMS.map((item) => {
            const active = isActive(item);
            return (
              <NavItemButton
                key={item.label}
                item={item}
                active={active}
                itemStyle={styles.topNavItem}
                style={
                  active
                    ? {
                        borderBottomColor: theme.primary,
                        borderBottomWidth: 2,
                      }
                    : undefined
                }
                textColor={active ? 'primary' : 'textSecondary'}
                textWeight={active ? 'semibold' : 'medium'}
                focusOutlineColor={theme.primary}
              />
            );
          })}
        </ScrollView>

        {/* Sign out — far right */}
        <View style={styles.topFooter}>
          <Button label="Sign out" variant="ghost" size="md" onPress={() => void signOut()} />
        </View>
      </View>
    );
  }

  // ── Side (vertical) layout — default ────────────────────────────────────
  return (
    <View
      style={[
        styles.sidebar,
        {
          backgroundColor: theme.surface,
          borderRightColor: theme.border,
        },
      ]}>
      {/* Brand header */}
      <View style={styles.brand}>
        <Text variant="heading" color="primary" weight="bold">
          QuickServe
        </Text>
        <Text variant="caption" color="textSecondary">
          Admin Panel
        </Text>
      </View>

      {/* Nav items */}
      <ScrollView
        style={styles.navList}
        contentContainerStyle={styles.navContent}
        showsVerticalScrollIndicator={false}>
        {NAV_ITEMS.map((item) => {
          const active = isActive(item);
          return (
            <NavItemButton
              key={item.label}
              item={item}
              active={active}
              itemStyle={styles.navItem}
              textColor={active ? 'primary' : 'textSecondary'}
              textWeight={active ? 'semibold' : 'medium'}
              focusOutlineColor={theme.primary}
            />
          );
        })}
      </ScrollView>

      {/* Footer — email + sign out */}
      <View style={[styles.footer, { borderTopColor: theme.border }]}>
        <Text variant="caption" color="textTertiary" numberOfLines={1} style={styles.emailText}>
          {email}
        </Text>
        <Button label="Sign out" variant="ghost" size="md" onPress={() => void signOut()} />
      </View>
    </View>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────

const SIDEBAR_WIDTH = 240;
/** Minimum tappable height per WCAG / platform HIG (≥ 44 px). */
const MIN_TOUCH = 44;

const styles = StyleSheet.create({
  // ── Side layout ──────────────────────────────────────────────────────────
  sidebar: {
    width: SIDEBAR_WIDTH,
    flexShrink: 0,
    borderRightWidth: StyleSheet.hairlineWidth,
    alignSelf: 'stretch',
  },
  brand: {
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.four,
    paddingBottom: Spacing.three,
    gap: Spacing.half,
  },
  navList: {
    flex: 1,
  },
  navContent: {
    paddingHorizontal: Spacing.two,
    paddingBottom: Spacing.three,
    gap: Spacing.half,
  },
  navItem: {
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two + 2,
    borderRadius: Radii.sm,
    minHeight: MIN_TOUCH,
    justifyContent: 'center',
  },
  footer: {
    borderTopWidth: StyleSheet.hairlineWidth,
    padding: Spacing.three,
    gap: Spacing.two,
  },
  emailText: {
    flexShrink: 1,
  },

  // ── Top layout ───────────────────────────────────────────────────────────
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    height: MIN_TOUCH + Spacing.two, // 52 px — compact but comfortable
  },
  topBrand: {
    paddingHorizontal: Spacing.three,
    flexShrink: 0,
  },
  topNavScroll: {
    flex: 1,
  },
  topNavContent: {
    flexDirection: 'row',
    alignItems: 'stretch',
    paddingHorizontal: Spacing.one,
    gap: Spacing.half,
  },
  topNavItem: {
    paddingHorizontal: Spacing.two + 2,
    minWidth: MIN_TOUCH,
    minHeight: MIN_TOUCH,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: Radii.sm,
    // Bottom accent placeholder — overridden inline when active
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  topFooter: {
    flexShrink: 0,
    paddingHorizontal: Spacing.two,
  },
});
