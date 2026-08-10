/**
 * Search screen — instant service search with recent searches, popular terms,
 * suggestions, and no-result recommendations.
 *
 * Entry: router.push('/search') from Home search bar.
 * Booking: tapping a result calls start(serviceId) → /booking/address.
 * No provider id ever enters the booking flow.
 */

import { useEffect, useState } from 'react';
import {
  FlatList,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';

import type { Service } from '@/constants/services';
import { BottomTabInset, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useBookingDraft } from '@/booking/booking-draft';
import { useServices } from '@/services/services-provider';
import {
  addRecentSearch,
  clearRecentSearches,
  getRecentSearches,
  noResultRecommendations,
  searchServices,
} from '@/lib/search';
import { SearchBar } from '@/components/ui/search-bar';
import { SearchHistoryList } from '@/components/ui/search-history-list';
import { SearchSuggestions } from '@/components/ui/search-suggestions';
import { PopularSearches } from '@/components/ui/popular-searches';
import { MarketplaceEmptyState } from '@/components/ui/marketplace-empty-state';
import { ServiceCard } from '@/components/ui/service-card';
import { SectionHeader } from '@/components/ui/section-header';
import { Text } from '@/components/ui/text';

export default function SearchScreen() {
  const theme = useTheme();
  const { start } = useBookingDraft();
  const { services } = useServices();

  const [query, setQuery] = useState('');
  const [recentSearches, setRecentSearches] = useState<string[]>([]);

  // Load recent searches on mount
  useEffect(() => {
    loadRecent();
  }, []);

  async function loadRecent() {
    const recents = await getRecentSearches();
    setRecentSearches(recents);
  }

  async function handleClearHistory() {
    await clearRecentSearches();
    setRecentSearches([]);
  }

  // When a suggestion/recent/popular term is tapped, use it as the query
  function handleTermSelect(term: string) {
    setQuery(term);
  }

  async function handleServicePress(service: Service) {
    // Record search term before booking
    await addRecentSearch(query.trim() || service.title);
    start(service.id);
    router.push('/booking/address');
  }

  const results = query.trim() ? searchServices(services, query) : [];
  const hasQuery = query.trim().length > 0;
  const hasResults = results.length > 0;
  const noResults = hasQuery && !hasResults;
  const recommendations = noResults ? noResultRecommendations() : [];

  return (
    <SafeAreaView
      edges={['top']}
      style={[styles.safe, { backgroundColor: theme.background }]}
    >
      {/* ── Back + Search bar row ──────────────────────────────────── */}
      <View style={styles.headerRow}>
        <TouchableOpacity
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel="Go back"
          style={styles.backBtn}
        >
          <Text variant="body" color="primary">
            ← Back
          </Text>
        </TouchableOpacity>
        <View style={styles.searchBarWrapper}>
          <SearchBar
            placeholder="Search services..."
            value={query}
            onChangeText={setQuery}
          />
        </View>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* ── Before typing: recent searches + popular searches ───── */}
        {!hasQuery ? (
          <View style={styles.preSearchSection}>
            <SearchHistoryList
              items={recentSearches}
              onSelect={handleTermSelect}
              onClear={handleClearHistory}
            />
            <PopularSearches onSelect={handleTermSelect} />
          </View>
        ) : null}

        {/* ── While typing: suggestions ───────────────────────────── */}
        {hasQuery ? (
          <View style={styles.suggestionsWrapper}>
            <SearchSuggestions query={query} onSelect={handleTermSelect} />
          </View>
        ) : null}

        {/* ── Results ─────────────────────────────────────────────── */}
        {hasQuery && hasResults ? (
          <View style={styles.resultsSection}>
            <SectionHeader title={`Results (${results.length})`} />
            <View style={styles.grid}>
              {results.map((service) => (
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
        ) : null}

        {/* ── No results: empty state + recommendations ────────────── */}
        {noResults ? (
          <View style={styles.noResultsSection}>
            <MarketplaceEmptyState variant="no-results" />
            {recommendations.length > 0 ? (
              <View style={styles.recommendationsSection}>
                <SectionHeader title="You might like" />
                <View style={styles.grid}>
                  {recommendations.map((service) => (
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
            ) : null}
          </View>
        ) : null}

        {/* Padding at bottom */}
        <View style={{ height: BottomTabInset + Spacing.five }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.two,
    paddingBottom: Spacing.three,
    gap: Spacing.two,
  },
  backBtn: {
    paddingVertical: Spacing.two,
  },
  searchBarWrapper: {
    flex: 1,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: Spacing.five,
  },
  preSearchSection: {
    gap: Spacing.four,
    paddingTop: Spacing.two,
  },
  suggestionsWrapper: {
    paddingHorizontal: Spacing.four,
    paddingBottom: Spacing.two,
  },
  resultsSection: {
    paddingHorizontal: Spacing.four,
    gap: Spacing.three,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.three,
  },
  gridItem: {
    width: '47%',
    maxWidth: '47%',
  },
  noResultsSection: {
    paddingHorizontal: Spacing.four,
    gap: Spacing.four,
  },
  recommendationsSection: {
    gap: Spacing.three,
  },
});
