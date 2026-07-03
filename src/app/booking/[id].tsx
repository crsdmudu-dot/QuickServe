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

import { useLocalSearchParams, router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { SERVICES } from '@/constants/services';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { getBookingById, getBookingProfessional, type Booking, type Professional } from '@/lib/bookings';
import { getBookingPhotos, type BookingPhotoView } from '@/lib/photos';
import { getBookingActivity, type BookingActivity } from '@/lib/activity';
import { getMyReviewForBooking, submitReview, REVIEW_TAGS, type Review } from '@/lib/reviews';
import { acceptQuote, declineQuote } from '@/lib/quotes';
import { getPaymentForBooking, type Payment } from '@/lib/payments';
import { initiateMpesaPayment, getPaymentAttempts, type PaymentAttempt } from '@/lib/attempts';
import { AttemptStatusBadge } from '@/components/ui/attempt-status-badge';
import { BookingSummaryCard } from '@/components/ui/booking-summary-card';
import { StatusBadge } from '@/components/ui/status-badge';
import { Card } from '@/components/ui/card';
import { SectionHeader } from '@/components/ui/section-header';
import { Text } from '@/components/ui/text';
import { ProfessionalCard } from '@/components/ui/professional-card';
import { PhotoGallery } from '@/components/ui/photo-gallery';
import { PhotoUploadButton } from '@/components/ui/photo-upload-button';
import { ActivityTimeline } from '@/components/ui/activity-timeline';
import { StarInput } from '@/components/ui/star-input';
import { ReviewCard } from '@/components/ui/review-card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { QuoteCard } from '@/components/ui/quote-card';

export default function BookingDetailScreen() {
  const theme = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();

  const [booking, setBooking] = useState<Booking | null>(null);
  const [professional, setProfessional] = useState<Professional | null>(null);
  const [photos, setPhotos] = useState<BookingPhotoView[]>([]);
  const [activity, setActivity] = useState<BookingActivity[]>([]);
  const [review, setReview] = useState<Review | null>(null);
  const [payment, setPayment] = useState<Payment | null>(null);
  const [attempts, setAttempts] = useState<PaymentAttempt[]>([]);
  const [phone, setPhone] = useState('');
  const [payError, setPayError] = useState<string | null>(null);
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [reviewError, setReviewError] = useState<string | null>(null);
  // Optional Ratings 2.0 fields — all start at their "unset" sentinel.
  const [qualityRating, setQualityRating] = useState(0);
  const [punctualityRating, setPunctualityRating] = useState(0);
  const [communicationRating, setCommunicationRating] = useState(0);
  const [professionalismRating, setProfessionalismRating] = useState(0);
  const [valueRating, setValueRating] = useState(0);
  const [wouldRecommend, setWouldRecommend] = useState<boolean | null>(null);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [privateFeedback, setPrivateFeedback] = useState('');
  const [quoteError, setQuoteError] = useState<string | null>(null);

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
        getPaymentForBooking(id).then((p) => {
          setPayment(p);
          if (p) getPaymentAttempts(p.id).then(setAttempts);
        });
      });
      loadPhotos();
      getBookingActivity(id).then(setActivity);
    }
  }, [id, loadPhotos]);

  async function reload() {
    const b = await getBookingById(id); if (b) setBooking(b);
    const p = await getPaymentForBooking(id);
    setPayment(p);
    if (p) setAttempts(await getPaymentAttempts(p.id));
  }

  async function handleAccept() {
    setQuoteError(null);
    const r = await acceptQuote(id);
    if (r.ok) await reload(); else setQuoteError(r.error ?? 'Could not accept quote.');
  }

  async function handleDecline() {
    setQuoteError(null);
    const r = await declineQuote(id);
    if (r.ok) await reload(); else setQuoteError(r.error ?? 'Could not decline quote.');
  }

  async function handlePayMpesa() {
    if (!payment) return;
    setPayError(null);
    const r = await initiateMpesaPayment({
      paymentId: payment.id,
      amount: payment.amount,
      phone,
      accountReference: booking!.id,
    });
    if (r.ok) {
      setAttempts(await getPaymentAttempts(payment.id));
    } else {
      setPayError(r.error ?? 'Could not start payment.');
    }
  }

  async function handleSubmitReview() {
    if (!booking || !booking.assigned_provider_id || rating === 0) return;
    setReviewError(null);
    // Build payload conditionally so an overall-only submit is byte-identical to
    // the previous behaviour — optional fields are only included when actually set.
    const payload: Parameters<typeof submitReview>[0] = {
      bookingId: id,
      providerId: booking.assigned_provider_id,
      rating,
      comment,
    };
    if (qualityRating > 0) payload.qualityRating = qualityRating;
    if (punctualityRating > 0) payload.punctualityRating = punctualityRating;
    if (communicationRating > 0) payload.communicationRating = communicationRating;
    if (professionalismRating > 0) payload.professionalismRating = professionalismRating;
    if (valueRating > 0) payload.valueRating = valueRating;
    if (wouldRecommend != null) payload.wouldRecommend = wouldRecommend;
    if (selectedTags.length) payload.tags = selectedTags;
    if (privateFeedback.trim()) payload.privateFeedback = privateFeedback.trim();
    const result = await submitReview(payload);
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
        <View style={styles.loadingContainer}>
          <Text variant="body" color="textSecondary">
            Loading…
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  const service = SERVICES.find((s) => s.id === booking.service_id);

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <Text variant="title" style={styles.pageTitle}>
          Booking Detail
        </Text>

        {/* Booking summary */}
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

        {/* Current status */}
        <View style={styles.statusRow}>
          <StatusBadge status={booking.status} />
        </View>

        {/* Payment section */}
        <SectionHeader title="Payment" />
        {booking.quote_status === 'sent' ? (
          <QuoteCard
            amount={booking.quoted_amount}
            quoteStatus="sent"
            onAccept={handleAccept}
            onDecline={handleDecline}
          />
        ) : payment != null ? (
          <View style={styles.paymentBlock}>
            <QuoteCard amount={payment.amount} quoteStatus={booking.quote_status} paymentStatus={payment.status} />
            {attempts.length > 0 && (
              <View style={styles.attemptBlock}>
                <AttemptStatusBadge status={attempts[0].status} />
                {(attempts[0].status === 'pending' || attempts[0].status === 'initiated') && (
                  <Text variant="caption" color="textSecondary">
                    Payment request sent. Awaiting confirmation.
                  </Text>
                )}
              </View>
            )}
            {payment.status === 'pending' && booking.status === 'completed' && (
              <View style={styles.mpesaBlock}>
                <Input
                  label="M-Pesa phone number"
                  value={phone}
                  onChangeText={setPhone}
                  placeholder="07XX XXX XXX"
                  keyboardType="phone-pad"
                  autoCapitalize="none"
                />
                <Button label="Pay with M-Pesa" onPress={handlePayMpesa} />
                <Button label="Card — coming soon" variant="ghost" disabled />
                {payError ? <Text variant="caption" color="error">{payError}</Text> : null}
              </View>
            )}
          </View>
        ) : booking.quote_status === 'pending' ? (
          <Text variant="body" color="textSecondary">
            No quote yet.
          </Text>
        ) : null}
        {quoteError ? (
          <Text variant="caption" color="error">
            {quoteError}
          </Text>
        ) : null}

        {/* Track button — only shown when provider is on the way or working */}
        {booking.assigned_provider_id != null &&
        (booking.status === 'on_the_way' || booking.status === 'in_progress') ? (
          <Button
            label="Track your provider"
            onPress={() => router.push(`/booking/track/${id}`)}
          />
        ) : null}

        {/* Chat button — only shown when a provider has been assigned */}
        {booking.assigned_provider_id ? (
          <Button label="Chat with provider" onPress={() => router.push(`/booking/chat/${id}`)} />
        ) : null}

        {/* Assigned professional — shown when a provider has been assigned */}
        {professional ? (
          <View style={styles.section}>
            <SectionHeader title="Assigned Professional" />
            <ProfessionalCard professional={professional} />
          </View>
        ) : booking.assigned_provider_name ? (
          <View style={styles.section}>
            <SectionHeader title="Assigned Professional" />
            <Card style={styles.providerCard}>
              <Text variant="body">{booking.assigned_provider_name}</Text>
            </Card>
          </View>
        ) : (
          <Text variant="body" color="textSecondary">
            No provider assigned yet
          </Text>
        )}

        {/* Photos section */}
        <View style={styles.section}>
          <SectionHeader title="Photos" />
          <PhotoGallery photos={photos} />
          <PhotoUploadButton
            bookingId={id}
            photoType="issue"
            label="Add issue photos"
            onUploaded={loadPhotos}
          />
        </View>

        {/* Activity section */}
        <View style={styles.section}>
          <SectionHeader title="Activity" />
          <ActivityTimeline events={activity} />
        </View>

        {/* Review section — only shown for completed bookings with an in-app provider */}
        {booking.status === 'completed' && booking.assigned_provider_id ? (
          review ? (
            <View style={styles.section}>
              <SectionHeader title="Your review" />
              <ReviewCard review={review} />
            </View>
          ) : (
            <View style={styles.section}>
              <SectionHeader title="Your review" />
              <StarInput value={rating} onChange={setRating} />
              <Input
                label="Comment (optional)"
                value={comment}
                onChangeText={setComment}
                placeholder="Share your experience…"
                multiline
              />

              {/* ── Ratings 2.0: category ratings ─────────────────────────── */}
              <View style={styles.categoryBlock}>
                <Text variant="label" color="textSecondary">Category ratings (optional)</Text>

                <View style={styles.categoryRow}>
                  <Text variant="label" style={styles.categoryLabel}>Quality</Text>
                  <StarInput idPrefix="quality" value={qualityRating} onChange={setQualityRating} />
                </View>

                <View style={styles.categoryRow}>
                  <Text variant="label" style={styles.categoryLabel}>Punctuality</Text>
                  <StarInput idPrefix="punctuality" value={punctualityRating} onChange={setPunctualityRating} />
                </View>

                <View style={styles.categoryRow}>
                  <Text variant="label" style={styles.categoryLabel}>Communication</Text>
                  <StarInput idPrefix="communication" value={communicationRating} onChange={setCommunicationRating} />
                </View>

                <View style={styles.categoryRow}>
                  <Text variant="label" style={styles.categoryLabel}>Professionalism</Text>
                  <StarInput idPrefix="professionalism" value={professionalismRating} onChange={setProfessionalismRating} />
                </View>

                <View style={styles.categoryRow}>
                  <Text variant="label" style={styles.categoryLabel}>Value</Text>
                  <StarInput idPrefix="value" value={valueRating} onChange={setValueRating} />
                </View>
              </View>

              {/* ── Would-recommend toggle ─────────────────────────────────── */}
              <View style={styles.recommendRow}>
                <Button
                  label="Would recommend"
                  variant={wouldRecommend === true ? 'primary' : 'ghost'}
                  onPress={() => setWouldRecommend(wouldRecommend === true ? null : true)}
                />
                <Button
                  label="Would not recommend"
                  variant={wouldRecommend === false ? 'primary' : 'ghost'}
                  onPress={() => setWouldRecommend(wouldRecommend === false ? null : false)}
                />
              </View>

              {/* ── Tag chips ─────────────────────────────────────────────── */}
              <View style={styles.tagsBlock}>
                <Text variant="label" color="textSecondary">Tags (optional)</Text>
                <View style={styles.tagsRow}>
                  {REVIEW_TAGS.map((tag) => {
                    const isSelected = selectedTags.includes(tag.key);
                    return (
                      <Pressable
                        key={tag.key}
                        testID={`tag-${tag.key}`}
                        onPress={() =>
                          setSelectedTags(
                            isSelected
                              ? selectedTags.filter((k) => k !== tag.key)
                              : [...selectedTags, tag.key],
                          )
                        }
                        style={[
                          styles.chip,
                          isSelected && styles.chipSelected,
                        ]}>
                        <Text
                          variant="caption"
                          color={isSelected ? 'primary' : 'textSecondary'}>
                          {tag.label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>

              {/* ── Private feedback ──────────────────────────────────────── */}
              <Input
                label="Private feedback to admin (optional)"
                value={privateFeedback}
                onChangeText={setPrivateFeedback}
                placeholder="Only visible to QuickServe admin…"
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
            </View>
          )
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: { padding: Spacing.four, gap: Spacing.four },
  pageTitle: { marginBottom: Spacing.one },
  statusRow: { flexDirection: 'row' },
  section: { gap: Spacing.three },
  paymentBlock: { gap: Spacing.three },
  attemptBlock: { gap: Spacing.two },
  mpesaBlock: { gap: Spacing.three },
  providerCard: { gap: Spacing.two },
  // ── Ratings 2.0 styles ──────────────────────────────────────────────────
  categoryBlock: { gap: Spacing.two },
  categoryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  categoryLabel: { flex: 1 },
  recommendRow: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  tagsBlock: { gap: Spacing.two },
  tagsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  chip: {
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.one,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#ECEEF1',
    backgroundColor: '#F7F8FA',
  },
  chipSelected: {
    borderColor: '#00875A',
    backgroundColor: '#E7F7F0',
  },
});
