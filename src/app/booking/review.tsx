/**
 * Review screen — final step of the booking flow.
 *
 * Shows a summary of the draft and lets the customer place the booking.  On
 * success we upload any issue photos best-effort, then clear the draft and
 * replace the route with the success screen (with a photoWarning param if any
 * upload failed).  On booking creation failure we show an inline error and
 * stay put — no photos are uploaded.  The booking is always created regardless
 * of photo upload outcome.
 *
 * Slice 20: also renders a DestinationSummary showing the full structured
 * address, and passes all address fields to createBooking.
 */

import { router } from 'expo-router';
import { useRef, useState } from 'react';
import { Alert, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Spacing } from '@/constants/theme';
import { useServices } from '@/services/services-provider';
import { useTheme } from '@/hooks/use-theme';
import { useBookingDraft } from '@/booking/booking-draft';
import { createBooking, findActiveDuplicateBooking } from '@/lib/bookings';
import { uploadBookingPhoto } from '@/lib/photos';
import { BookingSummaryCard } from '@/components/ui/booking-summary-card';
import { Button } from '@/components/ui/button';
import { DestinationSummary } from '@/components/ui/destination-summary';
import { Text } from '@/components/ui/text';

export default function ReviewScreen() {
  const theme = useTheme();
  const { getServiceBySlug } = useServices();
  const {
    serviceId,
    address,
    scheduledFor,
    notes,
    issuePhotos,
    reset,
    ensureIdempotencyKey,
    // Slice 20 structured address fields
    address_label,
    latitude,
    longitude,
    building_name,
    floor,
    door_number,
    landmark,
    access_notes,
    // Slice 24 scheduling fields
    scheduling_type,
    time_window,
    window_start,
    window_end,
    recurrence,
  } = useBookingDraft();
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  // Re-entrancy guard: a ref (synchronous) so repeated Place Booking taps do not fire a second
  // network request before `submitting` state re-renders the disabled button. The DB idempotency
  // key remains the AUTHORITATIVE protection; this just avoids needless duplicate requests.
  const submittingRef = useRef(false);

  const service = serviceId ? getServiceBySlug(serviceId) : null;
  const ready = Boolean(serviceId && address.trim() && scheduledFor);

  async function handlePlaceBooking(bypassDuplicateCheck = false) {
    if (!ready || !serviceId || !scheduledFor) return;
    if (submittingRef.current) return; // ignore repeat taps while a submission is in flight
    submittingRef.current = true;
    setSubmitting(true);
    setError('');

    // ── Business-level duplicate WARNING (advisory; not the idempotency guard) ──
    // Skipped once the customer confirms "Book another anyway". Reads only the caller's own
    // active bookings (RLS owner-scoped) → never exposes another user's booking.
    if (!bypassDuplicateCheck) {
      const dup = await findActiveDuplicateBooking({ serviceId, address, building_name, floor, door_number });
      if (dup) {
        submittingRef.current = false;
        setSubmitting(false);
        const svcTitle = service?.title ?? serviceId;
        Alert.alert(
          'Similar booking found',
          `You already have an active ${svcTitle} booking at this address.`,
          [
            { text: 'View existing booking', onPress: () => router.push(`/booking/${dup.id}`) },
            // Explicitly authorizes a NEW logical booking — proceeds with the SAME idempotency
            // key of this submission (distinct from the existing booking's), so it creates.
            { text: 'Book another anyway', style: 'default', onPress: () => { void handlePlaceBooking(true); } },
          ],
        );
        return;
      }
    }

    const res = await createBooking({
      serviceId,
      address,
      scheduledFor,
      notes,
      // Slice 20 structured fields — empty strings are fine; createBooking
      // stores them as-is (undefined → null inside createBooking).
      address_label,
      latitude: latitude ?? undefined,
      longitude: longitude ?? undefined,
      building_name,
      floor,
      door_number,
      landmark,
      access_notes,
      // Slice 24 scheduling fields
      scheduling_type,
      time_window,
      window_start,
      window_end,
      recurrence,
      // Phase 4E.2 — one key per submission (retry-stable); makes creation idempotent.
      idempotencyKey: ensureIdempotencyKey(),
    });

    if (!res.ok) {
      submittingRef.current = false;
      setSubmitting(false);
      setError(res.error ?? 'Could not create booking. Please try again.');
      return;
    }

    // Booking created (or recovered on an idempotent retry) — upload issue photos best-effort.
    let anyFailed = false;
    for (const uri of issuePhotos) {
      const r = await uploadBookingPhoto({ bookingId: res.id!, uri, photoType: 'issue' });
      if (!r.ok) anyFailed = true;
    }

    submittingRef.current = false;
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

        {/* Slice 20: Location summary showing structured address details */}
        <DestinationSummary
          input={{ address, address_label, building_name, floor, door_number, landmark, access_notes }}
        />

        <BookingSummaryCard
          serviceTitle={service?.title ?? serviceId ?? 'Service'}
          address={address}
          scheduledFor={scheduledFor ?? ''}
          notes={notes}
          schedulingType={scheduling_type}
          timeWindow={time_window}
          windowStart={window_start}
          windowEnd={window_end}
          recurrence={recurrence}
        />

        {error ? (
          <Text variant="caption" color="error">
            {error}
          </Text>
        ) : null}

        <Button
          label={submitting ? 'Placing booking…' : 'Place Booking'}
          fullWidth
          onPress={() => handlePlaceBooking()}
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
