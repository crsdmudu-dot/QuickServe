/**
 * My Bookings screen — shows the signed-in customer's booking history.
 *
 * Loads bookings on mount via getCustomerBookings(), renders each as a
 * BookingStatusCard (pressable, status-accented). Tapping a card navigates
 * to the read-only booking detail screen. When there are no bookings an
 * EmptyState is shown instead.
 *
 * Slice 34: replaced inline Card+StatusBadge row with BookingStatusCard;
 * in-progress bookings also show a compact BookingProgressTracker.
 */

import { router } from 'expo-router';
import { FlatList, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { usePaginatedList } from '@/hooks/use-paginated-list';
import { getCustomerBookings } from '@/lib/bookings';
import { EmptyState } from '@/components/ui/empty-state';
import { LoadMoreButton } from '@/components/ui/load-more-button';
import { Skeleton } from '@/components/ui/skeleton';
import { Text } from '@/components/ui/text';
import { BookingStatusCard } from '@/components/customer/booking-status-card';
import { BookingProgressTracker } from '@/components/customer/booking-progress-tracker';

// Statuses that count as "in-progress" for the compact tracker
const IN_PROGRESS_STATUSES = new Set(['accepted', 'provider_assigned', 'on_the_way', 'in_progress']);

export default function CustomerBookingsScreen() {
  const theme = useTheme();

  const {
    items: bookings,
    loading,
    hasMore,
    loadMore,
  } = usePaginatedList((p, s) => getCustomerBookings(p, s));

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]}>
      <Text variant="title" style={styles.heading}>
        My Bookings
      </Text>

      {/* Loading skeleton — shown during initial load */}
      {loading && bookings.length === 0 ? (
        <View style={styles.skeletons}>
          <Skeleton height={88} radius={16} />
          <Skeleton height={88} radius={16} />
          <Skeleton height={88} radius={16} />
        </View>
      ) : bookings.length === 0 ? (
        <EmptyState
          icon="📋"
          title="No bookings yet"
          message="Your bookings will appear here once you place one."
        />
      ) : (
        <FlatList
          data={bookings}
          keyExtractor={(b) => b.id}
          contentContainerStyle={styles.list}
          ListFooterComponent={
            <LoadMoreButton onPress={loadMore} loading={loading} hasMore={hasMore} />
          }
          renderItem={({ item: b }) => (
            <View style={styles.cardWrapper}>
              <BookingStatusCard
                booking={b}
                onPress={() => router.push(`/booking/${b.id}`)}
              />
              {/* Compact progress tracker for in-progress bookings */}
              {IN_PROGRESS_STATUSES.has(b.status) && (
                <BookingProgressTracker status={b.status} />
              )}
            </View>
          )}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  heading: {
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.four,
    paddingBottom: Spacing.two,
  },
  list: { padding: Spacing.four, gap: Spacing.three },
  cardWrapper: { gap: Spacing.two },
  skeletons: {
    padding: Spacing.four,
    gap: Spacing.three,
  },
});
