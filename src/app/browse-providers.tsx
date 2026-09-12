/**
 * Providers browse screen — discovery-only list of public providers.
 *
 * Loads from listPublicProviders() on mount, applies pure client-side
 * search → filter → sort (T3 transforms). Favorite toggle is optimistic.
 *
 * DISCOVERY ONLY: tapping a card shows the provider name (no-op expand).
 * No booking, no dispatch, no provider-targeted booking.
 */

import { useEffect, useMemo, useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';

import type { ProviderFilters, ProviderSortKey } from '@/constants/discovery';
import { BottomTabInset, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import {
  addFavoriteProvider,
  getFavoriteProviderIds,
  removeFavoriteProvider,
} from '@/lib/favorites';
import { getCustomerBookings } from '@/lib/bookings';
import {
  listPublicProviders,
  filterProviders,
  searchProviders,
  sortProviders,
  type PublicProvider,
} from '@/lib/providers-browse';
import { DiscoverySkeleton } from '@/components/ui/discovery-skeleton';
import { MarketplaceEmptyState } from '@/components/ui/marketplace-empty-state';
import { MarketplaceProviderCard } from '@/components/ui/marketplace-provider-card';
import { ProviderFilterControls } from '@/components/ui/provider-filter-controls';
import { ProviderSortControls } from '@/components/ui/provider-sort-controls';
import { Button } from '@/components/ui/button';
import { SearchBar } from '@/components/ui/search-bar';
import { Text } from '@/components/ui/text';

const EMPTY_FILTERS: ProviderFilters = {};

export default function ProvidersScreen() {
  const theme = useTheme();

  // ── Remote data ──────────────────────────────────────────────────────────
  const [loading, setLoading] = useState(true);
  const [providers, setProviders] = useState<PublicProvider[]>([]);
  const [favoriteIds, setFavoriteIds] = useState<string[]>([]);
  const [recentlyUsedProviderIds, setRecentlyUsedProviderIds] = useState<string[]>([]);

  // ── Controls ─────────────────────────────────────────────────────────────
  const [searchQuery, setSearchQuery] = useState('');
  const [sort, setSort] = useState<ProviderSortKey>('highest_rated');
  const [filters, setFilters] = useState<ProviderFilters>(EMPTY_FILTERS);

  useEffect(() => {
    async function load() {
      setLoading(true);
      const [providerList, favIds, bookings] = await Promise.all([
        listPublicProviders(),
        getFavoriteProviderIds(),
        getCustomerBookings(),
      ]);

      // Derive recently-used provider ids from booking history (read-only).
      const seenProviders = new Set<string>();
      const recentProviderIds: string[] = [];
      for (const b of bookings) {
        if (b.assigned_provider_id && !seenProviders.has(b.assigned_provider_id)) {
          seenProviders.add(b.assigned_provider_id);
          recentProviderIds.push(b.assigned_provider_id);
        }
      }

      setProviders(providerList);
      setFavoriteIds(favIds);
      setRecentlyUsedProviderIds(recentProviderIds);
      setLoading(false);
    }
    load();
  }, []);

  // ── Derived list: search → filter → sort (all pure) ─────────────────────
  const displayList = useMemo(() => {
    const searched = searchProviders(providers, searchQuery);
    const filtered = filterProviders(searched, filters, {
      favoriteIds,
      recentlyUsedProviderIds,
    });
    return sortProviders(filtered, sort);
  }, [providers, searchQuery, filters, sort, favoriteIds, recentlyUsedProviderIds]);

  // ── Favorite toggle (optimistic) ─────────────────────────────────────────
  async function handleToggleFavorite(providerId: string) {
    const isFav = favoriteIds.includes(providerId);
    // Optimistic update
    setFavoriteIds((prev) =>
      isFav ? prev.filter((id) => id !== providerId) : [...prev, providerId],
    );
    const result = isFav
      ? await removeFavoriteProvider(providerId)
      : await addFavoriteProvider(providerId);
    // Revert on failure
    if (!result.ok) {
      setFavoriteIds((prev) =>
        isFav ? [...prev, providerId] : prev.filter((id) => id !== providerId),
      );
    }
  }

  const isEmpty = !loading && providers.length === 0;
  const isFiltered = !loading && providers.length > 0 && displayList.length === 0;

  return (
    <SafeAreaView
      edges={['top']}
      style={[styles.safe, { backgroundColor: theme.background }]}
    >
      {/* ── Header ──────────────────────────────────────────────────── */}
      <View style={styles.header}>
        <Button label="← Back" variant="ghost" onPress={() => router.back()} />
        <Text variant="title" style={styles.heading}>
          Browse Providers
        </Text>
      </View>

      {/* ── Search input ────────────────────────────────────────────── */}
      <View style={styles.searchWrapper}>
        <SearchBar
          placeholder="Search providers..."
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
      </View>

      {/* ── Sort chips ──────────────────────────────────────────────── */}
      <ProviderSortControls value={sort} onChange={setSort} />

      {/* ── Filter chips ────────────────────────────────────────────── */}
      <ProviderFilterControls value={filters} onChange={setFilters} />

      {/* ── Body ────────────────────────────────────────────────────── */}
      {loading ? (
        <View style={styles.skeletonWrapper}>
          <DiscoverySkeleton variant="card" count={4} />
        </View>
      ) : isEmpty ? (
        <MarketplaceEmptyState variant="no-providers" />
      ) : isFiltered ? (
        <MarketplaceEmptyState variant="no-results" />
      ) : (
        <FlatList
          data={displayList}
          keyExtractor={(p) => p.provider_id}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          renderItem={({ item }) => (
            <MarketplaceProviderCard
              provider={item}
              isFavorite={favoriteIds.includes(item.provider_id)}
              onToggleFavorite={handleToggleFavorite}
              // Discovery-only: no booking initiated from card tap
            />
          )}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
  },
  header: {
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.four,
    paddingBottom: Spacing.two,
  },
  heading: {},
  searchWrapper: {
    paddingHorizontal: Spacing.four,
    paddingBottom: Spacing.two,
  },
  skeletonWrapper: {
    padding: Spacing.four,
  },
  list: {
    padding: Spacing.four,
    gap: Spacing.three,
    paddingBottom: BottomTabInset + Spacing.five,
  },
});
