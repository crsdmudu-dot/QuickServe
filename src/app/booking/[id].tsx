/**
 * Booking detail screen — read-only view of a single booking for customers.
 *
 * Loads the booking by id (from URL params) via getBookingById().  Shows a
 * BookingSummaryCard with service details and a StatusBadge.  If a provider
 * has been assigned, their name and phone are shown in a Card; otherwise a
 * muted message is displayed instead.  No mutations are exposed here — admin
 * actions live in src/app/(admin)/booking/[id].tsx.
 */

import { useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { SERVICES } from '@/constants/services';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { getBookingById, type Booking } from '@/lib/bookings';
import { BookingSummaryCard } from '@/components/ui/booking-summary-card';
import { StatusBadge } from '@/components/ui/status-badge';
import { Card } from '@/components/ui/card';
import { Text } from '@/components/ui/text';

export default function BookingDetailScreen() {
  const theme = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();

  const [booking, setBooking] = useState<Booking | null>(null);

  useEffect(() => {
    if (id) {
      getBookingById(id).then((b) => {
        if (b) setBooking(b);
      });
    }
  }, [id]);

  if (!booking) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]}>
        <Text variant="body" color="textSecondary">
          Loading…
        </Text>
      </SafeAreaView>
    );
  }

  const service = SERVICES.find((s) => s.id === booking.service_id);

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text variant="title">Booking Detail</Text>

        {/* Booking summary */}
        <BookingSummaryCard
          serviceTitle={service?.title ?? booking.service_id}
          address={booking.address}
          scheduledFor={booking.scheduled_for}
          notes={booking.notes ?? ''}
        />

        {/* Current status */}
        <StatusBadge status={booking.status} />

        {/* Provider info — shown only when a provider has been assigned */}
        {booking.assigned_provider_name ? (
          <Card style={styles.providerCard}>
            <Text variant="heading">Provider</Text>
            <Text variant="body">{booking.assigned_provider_name}</Text>
            <Text variant="body" color="textSecondary">
              {booking.assigned_provider_phone}
            </Text>
          </Card>
        ) : (
          <Text variant="body" color="textSecondary">
            No provider assigned yet
          </Text>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  content: { padding: Spacing.four, gap: Spacing.three },
  providerCard: { gap: Spacing.two },
});
