import { router } from 'expo-router';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  CATEGORY_LABELS,
  CATEGORY_ORDER,
  getPopularServices,
  getServicesByCategory,
  type Service,
} from '@/constants/services';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';
import { getGreeting } from '@/lib/greeting';
import { useTheme } from '@/hooks/use-theme';
import { useBookingDraft } from '@/booking/booking-draft';
import { SearchBar } from '@/components/ui/search-bar';
import { SectionHeader } from '@/components/ui/section-header';
import { ServiceCard } from '@/components/ui/service-card';
import { Text } from '@/components/ui/text';

export default function HomeScreen() {
  const theme = useTheme();
  const { start } = useBookingDraft();

  function handleServicePress(service: Service) {
    start(service.id);
    router.push('/booking/address');
  }
  const popular = getPopularServices();

  return (
    <ScrollView
      style={{ backgroundColor: theme.background }}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <SafeAreaView edges={['top']} style={styles.safeArea}>
        {/* ── Hero header ──────────────────────────────────────────── */}
        <View style={styles.hero}>
          <Text variant="display">{getGreeting()}</Text>
          <Text variant="body" color="textSecondary">
            What service do you need today?
          </Text>
        </View>

        {/* ── Search bar ───────────────────────────────────────────── */}
        <SearchBar />

        {/* ── Popular (horizontal scroll) ──────────────────────────── */}
        <View style={styles.section}>
          <SectionHeader title="Popular" />
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.popularRow}
          >
            {popular.map((service) => (
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

        {/* ── Category grids (one section per category) ────────────── */}
        {CATEGORY_ORDER.map((category) => (
          <View key={category} style={styles.section}>
            <SectionHeader title={CATEGORY_LABELS[category]} />
            <View style={styles.grid}>
              {getServicesByCategory(category).map((service) => (
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
        ))}
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
});
