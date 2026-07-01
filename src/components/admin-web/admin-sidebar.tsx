/**
 * admin-sidebar.tsx
 *
 * Persistent left navigation for the web admin panel.
 * Desktop-first: fixed 240 px wide column. Reads the active segment from
 * useSegments() so the correct item is highlighted.
 *
 * RN/RN-web safe — uses only View, Pressable, ScrollView from react-native.
 */

import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
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
];

// ── Component ──────────────────────────────────────────────────────────────

export function AdminSidebar() {
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
      <ScrollView style={styles.navList} contentContainerStyle={styles.navContent} showsVerticalScrollIndicator={false}>
        {NAV_ITEMS.map((item) => {
          const active = isActive(item);
          return (
            <Pressable
              key={item.label}
              accessibilityRole="button"
              accessibilityLabel={item.label}
              accessibilityState={{ selected: active }}
              onPress={() => router.push(item.route as Href)}
              style={({ pressed }) => [
                styles.navItem,
                active && { backgroundColor: theme.primaryTint },
                pressed && !active && { backgroundColor: theme.backgroundElement },
              ]}>
              <Text
                variant="label"
                color={active ? 'primary' : 'textSecondary'}
                weight={active ? 'semibold' : 'medium'}>
                {item.label}
              </Text>
            </Pressable>
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

const styles = StyleSheet.create({
  sidebar: {
    width: SIDEBAR_WIDTH,
    flexShrink: 0,
    borderRightWidth: StyleSheet.hairlineWidth,
    // On web this creates the fixed-height column; on native it's flex.
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
  },
  footer: {
    borderTopWidth: StyleSheet.hairlineWidth,
    padding: Spacing.three,
    gap: Spacing.two,
  },
  emailText: {
    flexShrink: 1,
  },
});
