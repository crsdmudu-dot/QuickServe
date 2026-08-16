/**
 * Favorites screen — shows the customer's favorited providers.
 *
 * Quick rebook: resolves a serviceId READ-ONLY from booking history
 * (most recent booking with that provider → its service_id; else most
 * recent booking's service_id; else route to /search).
 * HARD RULE: only calls start(serviceId) + /booking/service-details.
 * Never passes provider_id into the booking draft or any dispatch fn.
 */

import { useEffect, useState } from 'react';
import { FlatList, StyleSheet, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';

import { BottomTabInset, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useBookingDraft } from '@/booking/booking-draft';
import { getCustomerBookings, type Booking } from '@/lib/bookings';
import {
  getMyFavoriteProviders,
  removeFavoriteProvider,
  type PublicProvider,
} from '@/lib/favorites';
import { DiscoverySkeleton } from '@/components/ui/discovery-skeleton';
import { MarketplaceEmptyState } from '@/components/ui/marketplace-empty-state';
import { MarketplaceProviderCard } from '@/components/ui/marketplace-provider-card';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';

// ── Quick-rebook helper ──────────────────────────────────────────────────────
/**
 * Resolves the serviceId to use for a quick-rebook.
 * READ-ONLY from booking history — never writes, never passes provider_id
 * into any booking or dispatch call.
 *
 * Priority:
 * 1. Most recent booking assigned to this provider → its service_id.
 * 2. Most recent booking (any provider) → its service_id.
 * 3. null (caller routes to /search).
 */
function resolveRebookServiceId(
  providerId: string,
  bookings: Booking[],
): string | null {
  // 1. Most recent booking with this provider
  const providerBooking = bookings.find(
    (b) => b.assigned_provider_id === providerId,
  );
  if (providerBooking) return providerBooking.service_id;

  // 2. Most recent booking (any)
  if (bookings.length > 0) return bookings[0].service_id;

  // 3. No bookings found
  return null;
}

export default function FavoritesScreen() {
  const theme = useTheme();
  const { start } = useBookingDraft();

  const [loading, setLoading] = useState(true);
  const [favorites, setFavorites] = useState<PublicProvider[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);

  useEffect(() => {
    async function load() {
      setLoading(true);
      const [favs, bkgs] = await Promise.all([
        getMyFavoriteProviders(),
        getCustomerBookings(),
      ]);
      setFavorites(favs);
      setBookings(bkgs);
      setLoading(false);
    }
    load();
  }, []);

  // ── Remove favorite (optimistic) ──────────────────────────────────────────
  async function handleRemoveFavorite(providerId: string) {
    // Optimistic remove
    setFavorites((prev) =>
      prev.filter((p) => p.provider_id !== providerId),
    );
    const result = await removeFavoriteProvider(providerId);
    if (!result.ok) {
      // Revert: re-fetch to restore accurate state
      const refreshed = await getMyFavoriteProviders();
      setFavorites(refreshed);
    }
  }

  // ── Quick rebook ──────────────────────────────────────────────────────────
  function handleQuickRebook(provider: PublicProvider) {
    const serviceId = resolveRebookServiceId(provider.provider_id, bookings);
    if (!serviceId) {
      // No prior bookings → let customer pick a service
      router.push('/search');
      return;
    }
    // ONLY start(serviceId) → /booking/service-details.
    // provider_id is NEVER passed to start() or any dispatch fn.
    start(serviceId);
    router.push('/booking/service-details');
  }

  return (
    <SafeAreaView
      edges={['top']}
      style={[styles.safe, { backgroundColor: theme.background }]}
    >
      {/* ── Header ──────────────────────────────────────────────────── */}
      <Button label="← Back" variant="ghost" onPress={() => router.back()} />
      <Text variant="title" style={styles.heading}>
        My Favorites
      </Text>

      {/* ── Body ────────────────────────────────────────────────────── */}
      {loading ? (
        <View style={styles.skeletonWrapper}>
          <DiscoverySkeleton variant="card" count={3} />
        </View>
      ) : favorites.length === 0 ? (
        <MarketplaceEmptyState
          variant="no-favorites"
          actionLabel="Browse providers"
          onAction={() => router.push('/browse-providers')}
        />
      ) : (
        <FlatList
          data={favorites}
          keyExtractor={(p) => p.provider_id}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          renderItem={({ item }) => (
            <View>
              <MarketplaceProviderCard
                provider={item}
                isFavorite={true}
                onToggleFavorite={handleRemoveFavorite}
              />
              {/* Quick rebook CTA */}
              <TouchableOpacity
                onPress={() => handleQuickRebook(item)}
                accessibilityRole="button"
                accessibilityLabel={`Quick rebook with ${item.full_name ?? 'this provider'}`}
                style={[
                  styles.rebookBtn,
                  { backgroundColor: theme.primarySurface, borderColor: theme.primary },
                ]}
              >
                <Text variant="caption" color="primary" weight="semibold">
                  Book a service
                </Text>
              </TouchableOpacity>
            </View>
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
  heading: {
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.four,
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
  rebookBtn: {
    alignItems: 'center',
    paddingVertical: Spacing.two,
    borderRadius: 12,
    borderWidth: 1,
    marginTop: Spacing.two,
  },
});
