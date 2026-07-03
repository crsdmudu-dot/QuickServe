/**
 * Provider job detail screen — shows booking info, lets the provider
 * advance the status forward one step at a time, and add before/after photos.
 * Slice 21: wires live-location sharing indicator and a Navigate button.
 */

import { useLocalSearchParams, router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Linking, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { SERVICES } from '@/constants/services';
import { PROVIDER_NEXT_STATUSES, STATUS_LABELS } from '@/constants/booking-status';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { getBookingById, updateBookingStatus, type Booking } from '@/lib/bookings';
import { getBookingPhotos, type BookingPhotoView } from '@/lib/photos';
import { getBookingActivity, type BookingActivity } from '@/lib/activity';
import { BookingSummaryCard } from '@/components/ui/booking-summary-card';
import { StatusBadge } from '@/components/ui/status-badge';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { PhotoGallery } from '@/components/ui/photo-gallery';
import { PhotoUploadButton } from '@/components/ui/photo-upload-button';
import { ActivityTimeline } from '@/components/ui/activity-timeline';
import { SectionHeader } from '@/components/ui/section-header';
import { DestinationSummary } from '@/components/ui/destination-summary';
import { useProviderLocationSharing } from '@/hooks/use-provider-location-sharing';

export default function ProviderJobDetailScreen() {
  const theme = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();

  const [booking, setBooking] = useState<Booking | null>(null);
  const [error, setError] = useState('');
  const [photos, setPhotos] = useState<BookingPhotoView[]>([]);
  const [activity, setActivity] = useState<BookingActivity[]>([]);

  // Track screen focus so the sharing hook only runs while this screen is visible.
  const [focused, setFocused] = useState(false);
  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      return () => setFocused(false);
    }, []),
  );

  // Live-location sharing — hook handles all gating (assigned provider, active status, focus).
  const { sharing, permission } = useProviderLocationSharing(
    booking
      ? {
          id: booking.id,
          status: booking.status,
          assigned_provider_id: booking.assigned_provider_id,
        }
      : null,
    focused,
  );

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
      getBookingActivity(id).then(setActivity);
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
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <Text variant="title">Job Detail</Text>

        {/* ── Booking summary (service, address, date, notes) ──────────── */}
        <BookingSummaryCard
          serviceTitle={service?.title ?? booking.service_id}
          address={booking.address}
          scheduledFor={booking.scheduled_for}
          notes={booking.notes ?? ''}
          schedulingType={booking.scheduling_type}
          timeWindow={booking.time_window}
          windowStart={booking.window_start}
          windowEnd={booking.window_end}
          recurrence={booking.recurrence}
        />

        {/* ── Destination ──────────────────────────────────────────────── */}
        <View style={styles.section}>
          <SectionHeader title="Destination" />
          <DestinationSummary input={booking} />
          {/* Navigate button — only shown when the booking has coordinates */}
          {booking.latitude != null && booking.longitude != null ? (
            <Button
              label="Navigate"
              onPress={() => {
                const lat = booking.latitude as number;
                const lng = booking.longitude as number;
                const url = Platform.select({
                  ios: `http://maps.apple.com/?daddr=${lat},${lng}`,
                  android: `google.navigation:q=${lat},${lng}`,
                  default: `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`,
                }) as string;
                void Linking.openURL(url);
              }}
            />
          ) : null}
        </View>

        {/* ── Provider info row ────────────────────────────────────────── */}
        {booking.assigned_provider_name ? (
          <View style={styles.infoRow}>
            <Text variant="label" color="textSecondary">Provider</Text>
            <Text variant="body">{booking.assigned_provider_name}</Text>
          </View>
        ) : null}

        {/* ── Current status badge ─────────────────────────────────────── */}
        <View style={styles.statusRow}>
          <StatusBadge status={booking.status} />
        </View>

        {/* ── Live-location sharing indicator ──────────────────────────── */}
        {permission === 'denied' ? (
          <Text variant="caption" color="error">
            Location permission needed to share your live location.
          </Text>
        ) : sharing ? (
          <Text variant="caption" color="textSecondary">
            📍 Sharing your live location with the customer.
          </Text>
        ) : booking.status === 'on_the_way' || booking.status === 'in_progress' ? (
          <Text variant="caption" color="textSecondary">
            Preparing location sharing…
          </Text>
        ) : null}

        {/* ── Inline error message ─────────────────────────────────────── */}
        {error ? (
          <Text variant="caption" color="error">
            {error}
          </Text>
        ) : null}

        {/* ── Forward-only action buttons ──────────────────────────────── */}
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

        {/* ── Photos section ───────────────────────────────────────────── */}
        <View style={styles.section}>
          <SectionHeader title="Photos" />
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
        </View>

        {/* ── Activity section ─────────────────────────────────────────── */}
        <View style={styles.section}>
          <SectionHeader title="Activity" />
          <ActivityTimeline events={activity} />
        </View>

        {/* ── Chat button — only shown when a provider has been assigned ── */}
        {booking?.assigned_provider_id ? (
          <Button label="Chat with customer" onPress={() => router.push(`/provider/job/chat/${id}`)} />
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  content: { padding: Spacing.four, gap: Spacing.three },
  infoRow: { gap: Spacing.half },
  statusRow: { flexDirection: 'row' },
  actions: { gap: Spacing.two },
  section: { gap: Spacing.two },
});
