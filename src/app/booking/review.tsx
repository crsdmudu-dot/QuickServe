/**
 * Review screen — final step of the booking flow.
 *
 * Shows a summary of the draft and lets the customer place the booking.  On
 * success we upload any issue photos best-effort, then clear the draft and
 * replace the route with the success screen (with a photoWarning param if any
 * upload failed).  On booking creation failure we show an inline error and
 * stay put — no photos are uploaded.  The booking is always created regardless
 * of photo upload outcome.
 */

import { router } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { SERVICES } from '@/constants/services';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useBookingDraft } from '@/booking/booking-draft';
import { createBooking } from '@/lib/bookings';
import { uploadBookingPhoto } from '@/lib/photos';
import { BookingSummaryCard } from '@/components/ui/booking-summary-card';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';

export default function ReviewScreen() {
  const theme = useTheme();
  const { serviceId, address, scheduledFor, notes, issuePhotos, reset } = useBookingDraft();
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const service = SERVICES.find((s) => s.id === serviceId);
  const ready = Boolean(serviceId && address.trim() && scheduledFor);

  async function handlePlaceBooking() {
    if (!ready || !serviceId || !scheduledFor) return;
    setSubmitting(true);
    setError('');

    const res = await createBooking({ serviceId, address, scheduledFor, notes });

    if (!res.ok) {
      setSubmitting(false);
      setError(res.error ?? 'Could not create booking. Please try again.');
      return;
    }

    // Booking created — now upload issue photos best-effort
    let anyFailed = false;
    for (const uri of issuePhotos) {
      const r = await uploadBookingPhoto({ bookingId: res.id!, uri, photoType: 'issue' });
      if (!r.ok) anyFailed = true;
    }

    setSubmitting(false);
    reset();
    router.replace({
      pathname: '/booking/success',
      params: anyFailed ? { photoWarning: '1' } : {},
    });
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        {/* Step indicator */}
        <Text variant="caption" color="textSecondary" style={styles.step}>
          Step 4 of 4
        </Text>

        <Text variant="title" style={styles.title}>
          Review your booking
        </Text>

        <BookingSummaryCard
          serviceTitle={service?.title ?? 'Service'}
          address={address}
          scheduledFor={scheduledFor ?? ''}
          notes={notes}
        />

        {error ? (
          <Text variant="caption" color="error">
            {error}
          </Text>
        ) : null}

        <Button
          label={submitting ? 'Placing booking…' : 'Place Booking'}
          fullWidth
          onPress={handlePlaceBooking}
          disabled={!ready || submitting}
        />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  scroll: {
    flexGrow: 1,
    padding: Spacing.four,
    gap: Spacing.four,
  },
  step: { marginBottom: Spacing.one },
  title: { marginBottom: Spacing.two },
});
