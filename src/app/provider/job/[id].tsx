/**
 * Provider job detail screen — shows booking info, lets the provider
 * advance the status forward one step at a time, and add before/after photos.
 */

import { useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { SERVICES } from '@/constants/services';
import { PROVIDER_NEXT_STATUSES, STATUS_LABELS } from '@/constants/booking-status';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { getBookingById, updateBookingStatus, type Booking } from '@/lib/bookings';
import { getBookingPhotos, type BookingPhotoView } from '@/lib/photos';
import { BookingSummaryCard } from '@/components/ui/booking-summary-card';
import { StatusBadge } from '@/components/ui/status-badge';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { PhotoGallery } from '@/components/ui/photo-gallery';
import { PhotoUploadButton } from '@/components/ui/photo-upload-button';

export default function ProviderJobDetailScreen() {
  const theme = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();

  const [booking, setBooking] = useState<Booking | null>(null);
  const [error, setError] = useState('');
  const [photos, setPhotos] = useState<BookingPhotoView[]>([]);

  const loadPhotos = useCallback(() => {
    if (id) {
      getBookingPhotos(id).then(setPhotos);
    }
  }, [id]);

  useEffect(() => {
    if (id) {
      getBookingById(id).then((b) => {
        if (b) setBooking(b);
      });
      loadPhotos();
    }
  }, [id, loadPhotos]);

  async function handleAdvance(nextStatus: Booking['status']) {
    if (!id) return;
    setError('');
    const result = await updateBookingStatus(id, nextStatus);
    if (result.ok) {
      // Update local state so the UI reflects the new status immediately.
      setBooking((prev) => (prev ? { ...prev, status: nextStatus } : prev));
    } else {
      setError(result.error ?? 'Could not update status.');
    }
  }

  // Loading state
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
  const nextStatuses = PROVIDER_NEXT_STATUSES[booking.status];

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text variant="title">Job Detail</Text>

        {/* Booking summary (service, address, date, notes) */}
        <BookingSummaryCard
          serviceTitle={service?.title ?? booking.service_id}
          address={booking.address}
          scheduledFor={booking.scheduled_for}
          notes={booking.notes ?? ''}
        />

        {/* Customer / provider info */}
        {booking.assigned_provider_name ? (
          <View style={styles.infoRow}>
            <Text variant="label" color="textSecondary">Provider</Text>
            <Text variant="body">{booking.assigned_provider_name}</Text>
          </View>
        ) : null}

        {/* Current status badge */}
        <StatusBadge status={booking.status} />

        {/* Inline error message */}
        {error ? (
          <Text variant="caption" color="error">
            {error}
          </Text>
        ) : null}

        {/* Forward-only action buttons */}
        {nextStatuses.length > 0 ? (
          <View style={styles.actions}>
            {nextStatuses.map((next) => (
              <Button
                key={next}
                label={STATUS_LABELS[next]}
                onPress={() => handleAdvance(next)}
              />
            ))}
          </View>
        ) : (
          <Text variant="caption" color="textSecondary">
            No further action
          </Text>
        )}

        {/* Photos section — providers can add before/after photos; view only (no delete). */}
        <Text variant="heading">Photos</Text>
        <PhotoGallery photos={photos} />
        <PhotoUploadButton
          bookingId={id}
          photoType="before"
          label="Add before photo"
          onUploaded={loadPhotos}
        />
        <PhotoUploadButton
          bookingId={id}
          photoType="after"
          label="Add after / completion photo"
          onUploaded={loadPhotos}
        />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  content: { padding: Spacing.four, gap: Spacing.three },
  infoRow: { gap: Spacing.half },
  actions: { gap: Spacing.two },
});
