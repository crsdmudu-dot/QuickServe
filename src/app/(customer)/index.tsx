import { useEffect, useState } from 'react';
import { router } from 'expo-router';
import { ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { type Service } from '@/constants/services';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';
import { getGreeting } from '@/lib/greeting';
import { getRecentlyUsedServiceIds } from '@/lib/recent-services';
import { getUnreadNotificationCount } from '@/lib/notifications';
import { useTheme } from '@/hooks/use-theme';
import { useBookingDraft } from '@/booking/booking-draft';
import { useServices } from '@/services/services-provider';
import { SearchBar } from '@/components/ui/search-bar';
import { SectionHeader } from '@/components/ui/section-header';
import { ServiceCard } from '@/components/ui/service-card';
import { Skeleton } from '@/components/ui/skeleton';
import { Text } from '@/components/ui/text';
import { NotificationBell } from '@/components/notifications/notification-bell';

export default function HomeScreen() {
  const theme = useTheme();
  const { start } = useBookingDraft();
  const {
    services,
    categories,
    loading: servicesLoading,
    getFeatured,
    getTrending,
    getServicesByCategory,
    getServiceBySlug,
  } = useServices();

  // ── Recently-used services (async, from booking history) ────────────────
  const [recentServices, setRecentServices] = useState<Service[]>([]);
  const [recentLoading, setRecentLoading] = useState(true);

  useEffect(() => {
    getRecentlyUsedServiceIds()
      .then((ids) => ids.map((id) => getServiceBySlug(id)))
      .then(setRecentServices)
      .finally(() => setRecentLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Notification bell unread count ───────────────────────────────────────
  const [unreadNotifications, setUnreadNotifications] = useState(0);

  useEffect(() => {
    getUnreadNotificationCount().then(setUnreadNotifications);
  }, []);

  function handleServicePress(service: Service) {
    start(service.id);
    router.push('/booking/address');
  }

  const featured = getFeatured();
  const trending = getTrending();

  return (
    <ScrollView
      style={{ backgroundColor: theme.background }}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <SafeAreaView edges={['top']} style={styles.safeArea}>
        {/* ── Hero header ──────────────────────────────────────────── */}
        <View style={styles.hero}>
          <View style={styles.heroTop}>
            <Text variant="display">{getGreeting()}</Text>
            <NotificationBell
              count={unreadNotifications}
              onPress={() => router.push('/(customer)/notifications')}
            />
          </View>
          <Text variant="body" color="textSecondary">
            What service do you need today?
          </Text>
        </View>

        {/* ── Search bar — tappable, navigates to full search screen ─ */}
        <TouchableOpacity
          onPress={() => router.push('/(customer)/search')}
          accessibilityRole="button"
          accessibilityLabel="Search services"
          activeOpacity={0.85}
        >
          <SearchBar
            placeholder="Search services"
            // Uncontrolled display-only; interaction is handled by the push
          />
        </TouchableOpacity>

        {/* ── Quick entry links ─────────────────────────────────────── */}
        <View style={styles.entryLinks}>
          <TouchableOpacity
            onPress={() => router.push('/(customer)/providers')}
            accessibilityRole="button"
            style={[styles.entryLink, { backgroundColor: theme.primarySurface, borderColor: theme.primary }]}
          >
            <Text variant="caption" color="primary" weight="semibold">
              🛠 Browse providers
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => router.push('/(customer)/favorites')}
            accessibilityRole="button"
            style={[styles.entryLink, { backgroundColor: theme.primarySurface, borderColor: theme.primary }]}
          >
            <Text variant="caption" color="primary" weight="semibold">
              🤍 My favorites
            </Text>
          </TouchableOpacity>
        </View>

        {/* ── Popular (horizontal scroll) ──────────────────────────── */}
        <View style={styles.section}>
          <SectionHeader title="Popular" />
          {servicesLoading ? (
            <View style={styles.popularRow}>
              <Skeleton width={220} height={120} radius={16} />
              <Skeleton width={220} height={120} radius={16} />
            </View>
          ) : (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.popularRow}
            >
              {featured.map((service) => (
                <View key={service.id} style={styles.popularItem}>
                  <ServiceCard
                    icon={service.icon}
                    title={service.title}
                    subtitle={service.subtitle}
                    startingPrice={service.startingPrice}
                    badge={service.badge}
                    onPress={() => handleServicePress(service)}
                  />
                </View>
              ))}
            </ScrollView>
          )}
        </View>

        {/* ── Featured ─────────────────────────────────────────────── */}
        <View style={styles.section}>
          <SectionHeader title="Featured" />
          {servicesLoading ? (
            <View style={styles.popularRow}>
              <Skeleton width={220} height={120} radius={16} />
              <Skeleton width={220} height={120} radius={16} />
            </View>
          ) : (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.popularRow}
            >
              {featured.map((service) => (
                <View key={service.id} style={styles.popularItem}>
                  <ServiceCard
                    icon={service.icon}
                    title={service.title}
                    subtitle={service.subtitle}
                    startingPrice={service.startingPrice}
                    badge={service.badge}
                    onPress={() => handleServicePress(service)}
                  />
                </View>
              ))}
            </ScrollView>
          )}
        </View>

        {/* ── Trending ─────────────────────────────────────────────── */}
        <View style={styles.section}>
          <SectionHeader title="Trending" />
          {servicesLoading ? (
            <View style={styles.popularRow}>
              <Skeleton width={220} height={120} radius={16} />
              <Skeleton width={220} height={120} radius={16} />
            </View>
          ) : (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.popularRow}
            >
              {trending.map((service) => (
                <View key={service.id} style={styles.popularItem}>
                  <ServiceCard
                    icon={service.icon}
                    title={service.title}
                    subtitle={service.subtitle}
                    startingPrice={service.startingPrice}
                    badge={service.badge}
                    onPress={() => handleServicePress(service)}
                  />
                </View>
              ))}
            </ScrollView>
          )}
        </View>

        {/* ── Recently used (only when non-empty; skeleton while loading) ── */}
        {recentLoading ? (
          <View style={styles.section}>
            <SectionHeader title="Recently Used" />
            <View style={styles.popularRow}>
              <Skeleton width={220} height={120} radius={16} />
              <Skeleton width={220} height={120} radius={16} />
            </View>
          </View>
        ) : recentServices.length > 0 ? (
          <View style={styles.section}>
            <SectionHeader title="Recently Used" />
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.popularRow}
            >
              {recentServices.map((service) => (
                <View key={service.id} style={styles.popularItem}>
                  <ServiceCard
                    icon={service.icon}
                    title={service.title}
                    subtitle={service.subtitle}
                    startingPrice={service.startingPrice}
                    badge={service.badge}
                    onPress={() => handleServicePress(service)}
                  />
                </View>
              ))}
            </ScrollView>
          </View>
        ) : null}

        {/* ── Category grids (one section per category) ────────────── */}
        {servicesLoading ? (
          <View style={styles.section}>
            <Skeleton height={32} radius={8} />
            <View style={styles.grid}>
              <Skeleton width="47%" height={120} radius={16} />
              <Skeleton width="47%" height={120} radius={16} />
              <Skeleton width="47%" height={120} radius={16} />
              <Skeleton width="47%" height={120} radius={16} />
            </View>
          </View>
        ) : (
          categories.map((category) => (
            <View key={category.slug} style={styles.section}>
              <SectionHeader title={category.name} />
              <View style={styles.grid}>
                {getServicesByCategory(category.slug).map((service) => (
                  <View key={service.id} style={styles.gridItem}>
                    <ServiceCard
                      icon={service.icon}
                      title={service.title}
                      subtitle={service.subtitle}
                      startingPrice={service.startingPrice}
                      badge={service.badge}
                      onPress={() => handleServicePress(service)}
                    />
                  </View>
                ))}
              </View>
            </View>
          ))
        )}

        {/* ── Browse all categories footer link ────────────────────── */}
        <TouchableOpacity
          onPress={() => router.push('/(customer)/search')}
          accessibilityRole="button"
          style={[styles.browseAllBtn, { borderColor: theme.primary, backgroundColor: theme.primarySurface }]}
        >
          <Text variant="body" color="primary" weight="semibold">
            Browse all categories →
          </Text>
        </TouchableOpacity>
      </SafeAreaView>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  // Outer ScrollView contentContainerStyle — centres content on wide screens.
  content: {
    alignItems: 'center',
    paddingBottom: BottomTabInset + Spacing.five,
  },
  // SafeAreaView controls max-width and horizontal padding.
  safeArea: {
    width: '100%',
    maxWidth: MaxContentWidth,
    paddingHorizontal: Spacing.four,
    gap: Spacing.five,
  },
  // Hero greeting + subtitle block with generous top padding.
  hero: {
    paddingTop: Spacing.four,
    gap: Spacing.two,
  },
  // Row that places greeting text and notification bell side-by-side.
  heroTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  // Quick-entry row: browse providers + favorites
  entryLinks: {
    flexDirection: 'row',
    gap: Spacing.three,
    flexWrap: 'wrap',
  },
  entryLink: {
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderRadius: 12,
    borderWidth: 1,
  },
  // Each named section (Popular, Home Services, etc.).
  section: {
    gap: Spacing.three,
  },
  // Horizontal popular row padding.
  popularRow: {
    gap: Spacing.three,
    paddingRight: Spacing.four,
  },
  // Each popular card is fixed-width so the badge (top-right) never
  // overlaps the IconChip (top-left).
  popularItem: {
    width: 220,
  },
  // Two-column responsive grid.
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.three,
  },
  // Each grid cell is just under half-width; maxWidth prevents stretching
  // when a row has an odd last item.
  gridItem: {
    width: '47%',
    maxWidth: '47%',
  },
  // Browse all categories footer button
  browseAllBtn: {
    alignItems: 'center',
    paddingVertical: Spacing.three,
    borderRadius: 12,
    borderWidth: 1,
  },
});
