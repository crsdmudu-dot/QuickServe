/**
 * Booking detail screen — read-only view of a single booking for customers.
 *
 * Loads the booking by id (from URL params) via getBookingById().  Shows a
 * BookingSummaryCard with service details and a StatusBadge.  If the booking
 * has an in-app assigned_provider_id, fetches curated professional details via
 * getBookingProfessional() and renders a ProfessionalCard (no phone shown).
 * If only assigned_provider_name is set (manual/off-platform dispatch), shows
 * the name in a simple Card (no phone, no verified/skills).  Otherwise a muted
 * "No provider assigned yet" message is shown.
 * A "Photos" section at the bottom shows uploaded booking photos and lets the
 * customer add new issue photos via PhotoUploadButton.
 * When the booking is completed and has an assigned provider, a "Your review"
 * section lets the customer submit a star rating + comment, or view their
 * existing review via ReviewCard.
 */

import { useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { SERVICES } from '@/constants/services';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { getBookingById, getBookingProfessional, type Booking, type Professional } from '@/lib/bookings';
import { getBookingPhotos, type BookingPhotoView } from '@/lib/photos';
import { getBookingActivity, type BookingActivity } from '@/lib/activity';
import { getMyReviewForBooking, submitReview, type Review } from '@/lib/reviews';
import { BookingSummaryCard } from '@/components/ui/booking-summary-card';
import { StatusBadge } from '@/components/ui/status-badge';
import { Card } from '@/components/ui/card';
import { Text } from '@/components/ui/text';
import { ProfessionalCard } from '@/components/ui/professional-card';
import { PhotoGallery } from '@/components/ui/photo-gallery';
import { PhotoUploadButton } from '@/components/ui/photo-upload-button';
import { ActivityTimeline } from '@/components/ui/activity-timeline';
import { StarInput } from '@/components/ui/star-input';
import { ReviewCard } from '@/components/ui/review-card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

export default function BookingDetailScreen() {
  const theme = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();

  const [booking, setBooking] = useState<Booking | null>(null);
  const [professional, setProfessional] = useState<Professional | null>(null);
  const [photos, setPhotos] = useState<BookingPhotoView[]>([]);
  const [activity, setActivity] = useState<BookingActivity[]>([]);
  const [review, setReview] = useState<Review | null>(null);
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [reviewError, setReviewError] = useState<string | null>(null);

  const loadPhotos = useCallback(() => {
    if (id) {
      getBookingPhotos(id).then(setPhotos);
    }
  }, [id]);

  useEffect(() => {
    if (id) {
      getBookingById(id).then((b) => {
        if (b) {
          setBooking(b);
          if (b.assigned_provider_id) {
            getBookingProfessional(id).then(setProfessional);
          }
          // Load the customer's existing review only when the booking is completed
          // and has an assigned in-app provider.
          if (b.status === 'completed' && b.assigned_provider_id) {
            getMyReviewForBooking(id).then(setReview);
          }
        }
      });
      loadPhotos();
      getBookingActivity(id).then(setActivity);
    }
  }, [id, loadPhotos]);

  async function handleSubmitReview() {
    if (!booking || !booking.assigned_provider_id || rating === 0) return;
    setReviewError(null);
    const result = await submitReview({
      bookingId: id,
      providerId: booking.assigned_provider_id,
      rating,
      comment,
    });
    if (result.ok) {
      // Re-fetch the review so the ReviewCard replaces the form.
      const updated = await getMyReviewForBooking(id);
      setReview(updated);
    } else {
      setReviewError(result.error ?? 'Could not submit review.');
    }
  }

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

        {/* Assigned professional — shown when a provider has been assigned */}
        {professional ? (
          <>
            <Text variant="heading">Assigned Professional</Text>
            <ProfessionalCard professional={professional} />
          </>
        ) : booking.assigned_provider_name ? (
          <Card style={styles.providerCard}>
            <Text variant="heading">Assigned Professional</Text>
            <Text variant="body">{booking.assigned_provider_name}</Text>
          </Card>
        ) : (
          <Text variant="body" color="textSecondary">
            No provider assigned yet
          </Text>
        )}

        {/* Photos section */}
        <Text variant="heading">Photos</Text>
        <PhotoGallery photos={photos} />
        <PhotoUploadButton
          bookingId={id}
          photoType="issue"
          label="Add issue photos"
          onUploaded={loadPhotos}
        />

        {/* Activity section */}
        <Text variant="heading">Activity</Text>
        <ActivityTimeline events={activity} />

        {/* Review section — only shown for completed bookings with an in-app provider */}
        {booking.status === 'completed' && booking.assigned_provider_id ? (
          review ? (
            <>
              <Text variant="heading">Your review</Text>
              <ReviewCard review={review} />
            </>
          ) : (
            <>
              <Text variant="heading">Your review</Text>
              <StarInput value={rating} onChange={setRating} />
              <Input
                label="Comment (optional)"
                value={comment}
                onChangeText={setComment}
                placeholder="Share your experience…"
                multiline
              />
              {reviewError ? (
                <Text variant="caption" color="error">
                  {reviewError}
                </Text>
              ) : null}
              <Button
                label="Submit review"
                onPress={handleSubmitReview}
                disabled={rating === 0}
              />
            </>
          )
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  content: { padding: Spacing.four, gap: Spacing.three },
  providerCard: { gap: Spacing.two },
});
