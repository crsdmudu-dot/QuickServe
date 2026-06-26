/**
 * My Bookings screen — shows the signed-in customer's booking history.
 *
 * Loads bookings on mount via getCustomerBookings(), renders each as a
 * pressable Card with the service title, status badge, and scheduled date.
 * Tapping a card navigates to the read-only booking detail screen.
 * When there are no bookings an EmptyState is shown instead.
 */

import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { SERVICES } from '@/constants/services';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { getCustomerBookings, type Booking } from '@/lib/bookings';
import { StatusBadge } from '@/components/ui/status-badge';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { Text } from '@/components/ui/text';

export default function CustomerBookingsScreen() {
  const theme = useTheme();
  const [bookings, setBookings] = useState<Booking[] | null>(null);

  useEffect(() => {
    getCustomerBookings().then(setBookings);
  }, []);

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]}>
      <Text variant="title" style={styles.heading}>
        My Bookings
      </Text>

      {/* Loading skeleton — shown until the first fetch resolves */}
      {bookings === null ? (
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
          renderItem={({ item: b }) => {
            const service = SERVICES.find((s) => s.id === b.service_id);
            return (
              <Card onPress={() => router.push(`/booking/${b.id}`)} style={styles.card} elevation="e1">
                <Text variant="heading">{service?.title ?? b.service_id}</Text>
                <View style={styles.row}>
                  <StatusBadge status={b.status} />
                </View>
                <Text variant="caption" color="textSecondary">
                  {new Date(b.scheduled_for).toLocaleString()}
                </Text>
              </Card>
            );
          }}
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
  card: { gap: Spacing.two },
  row: { flexDirection: 'row' },
  skeletons: {
    padding: Spacing.four,
    gap: Spacing.three,
  },
});
