/**
 * Review screen — final step of the booking flow.
 *
 * Shows a summary of the draft and lets the customer place the booking.  On
 * success we clear the draft and replace the route with the success screen so
 * the back gesture can't return into the flow; on failure we show an inline
 * error and stay put.
 */

import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { SERVICES } from '@/constants/services';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useBookingDraft } from '@/booking/booking-draft';
import { createBooking } from '@/lib/bookings';
import { BookingSummaryCard } from '@/components/ui/booking-summary-card';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';

export default function ReviewScreen() {
  const theme = useTheme();
  const { serviceId, address, scheduledFor, notes, reset } = useBookingDraft();
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const service = SERVICES.find((s) => s.id === serviceId);
  const ready = Boolean(serviceId && address.trim() && scheduledFor);

  async function handlePlaceBooking() {
    if (!ready || !serviceId || !scheduledFor) return;
    setSubmitting(true);
    setError('');
    const result = await createBooking({ serviceId, address, scheduledFor, notes });
    setSubmitting(false);
    if (result.ok) {
      reset();
      router.replace('/booking/success');
      return;
    }
    setError(result.error ?? 'Could not create booking. Please try again.');
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]}>
      <Text variant="title">Review your booking</Text>

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
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, padding: Spacing.four, gap: Spacing.four },
});
