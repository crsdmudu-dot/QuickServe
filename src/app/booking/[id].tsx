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

import { Spacing } from '@/constants/theme';
import { useServices } from '@/services/services-provider';
import { useTheme } from '@/hooks/use-theme';
import { getBookingById, getBookingProfessional, type Booking, type Professional } from '@/lib/bookings';
import { getBookingPhotos, type BookingPhotoView } from '@/lib/photos';
import { getBookingActivity, type BookingActivity } from '@/lib/activity';
import { getMyReviewForBooking, submitReview, editReview, canEditReview, REVIEW_TAGS, type Review } from '@/lib/reviews';
import { acceptQuote, declineQuote } from '@/lib/quotes';
import { getPaymentForBooking, type Payment } from '@/lib/payments';
import { getMyWallet, applyWalletToPayment, amountDue } from '@/lib/wallet';
import { redeemPromo } from '@/lib/promotions';
import { formatKes } from '@/lib/currency';
import { buildReceipt } from '@/lib/receipts';
import { initiateMpesaPayment, getPaymentAttempts, type PaymentAttempt } from '@/lib/attempts';
import { AttemptStatusBadge } from '@/components/ui/attempt-status-badge';
import { BookingSummaryCard } from '@/components/ui/booking-summary-card';
import { DestinationSummary } from '@/components/ui/destination-summary';
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
import { BookingProgressTracker } from '@/components/customer/booking-progress-tracker';
import { PaymentBreakdownCard } from '@/components/customer/payment-breakdown-card';
import { ReviewEditForm } from '@/components/customer/review-edit-form';

export default function BookingDetailScreen() {
  const theme = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { getServiceBySlug } = useServices();

  const [booking, setBooking] = useState<Booking | null>(null);
  const [professional, setProfessional] = useState<Professional | null>(null);
  const [photos, setPhotos] = useState<BookingPhotoView[]>([]);
  const [activity, setActivity] = useState<BookingActivity[]>([]);
  const [review, setReview] = useState<Review | null>(null);
  const [payment, setPayment] = useState<Payment | null>(null);
  const [attempts, setAttempts] = useState<PaymentAttempt[]>([]);
  const [walletBalance, setWalletBalance] = useState(0);
  const [phone, setPhone] = useState('');
  const [payError, setPayError] = useState<string | null>(null);
  const [promoCode, setPromoCode] = useState('');
  const [promoError, setPromoError] = useState('');
  const [promoMsg, setPromoMsg] = useState('');
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
  // In-flight flags — prevent double-tap from firing the same request twice.
  const [payingMpesa, setPayingMpesa] = useState(false);
  const [applyingPromo, setApplyingPromo] = useState(false);
  const [applyingWallet, setApplyingWallet] = useState(false);
  const [submittingReview, setSubmittingReview] = useState(false);
  // Slice 34: review edit affordance visibility
  const [showEditReview, setShowEditReview] = useState(false);

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
        getMyWallet().then((w) => setWalletBalance(w.balance));
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

  async function reloadPayment() {
    const p = await getPaymentForBooking(id);
    setPayment(p);
    const w = await getMyWallet();
    setWalletBalance(w.balance);
  }

  // Slice 34: refresh the review after an edit and collapse the edit form.
  async function reloadReview() {
    const updated = await getMyReviewForBooking(id);
    setReview(updated);
    setShowEditReview(false);
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

  async function handleApplyPromo() {
    if (!payment) return;
    setApplyingPromo(true);
    setPromoError('');
    setPromoMsg('');
    try {
      const res = await redeemPromo(payment.id, promoCode.trim());
      if (res.ok) {
        setPromoCode('');
        setPromoMsg(res.discount ? `You saved ${formatKes(res.discount)}` : 'Promo applied.');
        await reloadPayment();
      } else {
        setPromoError(res.error ?? 'Could not apply promo code.');
      }
    } finally {
      setApplyingPromo(false);
    }
  }

  async function handlePayMpesa() {
    if (!payment) return;
    setPayingMpesa(true);
    setPayError(null);
    try {
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
    } finally {
      setPayingMpesa(false);
    }
  }

  async function handleSubmitReview() {
    if (!booking || !booking.assigned_provider_id || rating === 0) return;
    setSubmittingReview(true);
    setReviewError(null);
    try {
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
    } finally {
      setSubmittingReview(false);
    }
  }

  // Visible, safe Back control. Booking Detail can be the FIRST route in the stack (opened
  // from My Bookings / Payments / a notification tap / duplicate-warning "View existing"),
  // so there may be no in-navigator screen to pop and the native header shows no back arrow —
  // hence we render our own. When a previous route exists we pop it (preserving the normal
  // stack + iOS swipe-back); otherwise (cold-start/terminated push, deep link) we fall back
  // to a deterministic customer-safe destination instead of a dead-end/black screen.
  function handleBack() {
    if (router.canGoBack()) router.back();
    else router.replace('/bookings');
  }

  const backHeader = (
    <View style={styles.headerRow}>
      <Button label="← Back" variant="ghost" onPress={handleBack} testID="booking-detail-back" />
    </View>
  );

  if (!booking) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]}>
        {backHeader}
        <View style={styles.loadingContainer}>
          <Text variant="body" color="textSecondary">
            Loading…
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  const service = getServiceBySlug(booking.service_id);

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]}>
      {backHeader}
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <Text variant="title" style={styles.pageTitle}>
          Booking Detail
        </Text>

        {/* Booking summary */}
        <BookingSummaryCard
          serviceTitle={service.title}
          address={booking.address}
          scheduledFor={booking.scheduled_for}
          notes={booking.notes ?? ''}
          schedulingType={booking.scheduling_type}
          timeWindow={booking.time_window}
          windowStart={booking.window_start}
          windowEnd={booking.window_end}
          recurrence={booking.recurrence}
        />

        {/* Structured destination breakdown — same component the provider/admin/review
            screens use, so the customer sees the building/floor/door/landmark/access
            details they entered. Fallback-aware for manual/old bookings. */}
        <DestinationSummary input={booking} />

        {/* Current status */}
        <View style={styles.statusRow}>
          <StatusBadge status={booking.status} />
        </View>

        {/* Slice 34: booking progress tracker */}
        <BookingProgressTracker status={booking.status} />

        {/* Slice 34: service summary — display-only */}
        <View style={styles.serviceSummaryRow}>
          <Text style={styles.serviceIcon}>{service.icon}</Text>
          <View style={styles.serviceSummaryText}>
            <Text variant="label" weight="semibold">{service.title}</Text>
            {service.subtitle ? (
              <Text variant="caption" color="textSecondary">{service.subtitle}</Text>
            ) : null}
          </View>
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
                {/* ── Promo discount display ──────────────────────────── */}
                {payment.promo_discount && payment.promo_discount > 0 ? (
                  <>
                    <Text variant="body">Promo discount: −{formatKes(payment.promo_discount)}</Text>
                    <Text variant="body">You saved {formatKes(payment.promo_discount)}</Text>
                  </>
                ) : null}
                {/* ── Promo code entry (only when no promo applied yet) ── */}
                {!payment.promo_code_id ? (
                  <>
                    <Input
                      label="Promo code"
                      value={promoCode}
                      onChangeText={setPromoCode}
                      placeholder="Enter promo code"
                      autoCapitalize="characters"
                    />
                    <Button label="Apply promo" onPress={handleApplyPromo} disabled={applyingPromo} />
                    {promoError ? <Text variant="caption" color="error">{promoError}</Text> : null}
                    {promoMsg ? <Text variant="caption" color="success">{promoMsg}</Text> : null}
                  </>
                ) : (
                  <Text variant="caption" color="success">Promo applied</Text>
                )}
                {/* ── Wallet summary ──────────────────────────────────────── */}
                <Text variant="body">Amount: {formatKes(payment.amount)}</Text>
                {(payment.wallet_applied ?? 0) > 0 && (
                  <Text variant="body">Wallet applied: −{formatKes(payment.wallet_applied!)}</Text>
                )}
                <Text variant="body">Wallet balance: {formatKes(walletBalance)}</Text>
                <Text variant="body">Amount due: {formatKes(amountDue(payment))}</Text>
                {walletBalance > 0 && amountDue(payment) > 0 && (
                  <Button
                    label={`Apply wallet credit (${formatKes(Math.min(walletBalance, amountDue(payment)))})`}
                    disabled={applyingWallet}
                    onPress={async () => {
                      setApplyingWallet(true);
                      setPayError(null);
                      try {
                        const due = amountDue(payment);
                        const amt = Math.min(walletBalance, due);
                        const res = await applyWalletToPayment(payment.id, amt);
                        if (res.ok) {
                          await reloadPayment();
                        } else {
                          setPayError(res.error ?? 'Could not apply wallet credit.');
                        }
                      } finally {
                        setApplyingWallet(false);
                      }
                    }}
                  />
                )}
                {/* ── M-Pesa input ─────────────────────────────────────── */}
                <Input
                  label="M-Pesa phone number"
                  value={phone}
                  onChangeText={setPhone}
                  placeholder="07XX XXX XXX"
                  keyboardType="phone-pad"
                  autoCapitalize="none"
                />
                <Button label="Pay with M-Pesa" onPress={handlePayMpesa} disabled={payingMpesa} />
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

        {/* Slice 34: Payment breakdown card — display-only, built from already-loaded payment */}
        {payment != null && (
          <View style={styles.section}>
            <SectionHeader title="Payment Breakdown" />
            <PaymentBreakdownCard receipt={buildReceipt({ booking, payment })} />
            <Button
              label="View Receipt"
              variant="secondary"
              onPress={() => router.push(`/booking/receipt?id=${id}`)}
            />
          </View>
        )}

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
              {/* Slice 34: edit affordance — shown when within 24h window */}
              {canEditReview(review) && !showEditReview && (
                <Button
                  label="Edit review"
                  variant="secondary"
                  onPress={() => setShowEditReview(true)}
                />
              )}
              {canEditReview(review) && showEditReview && (
                <ReviewEditForm
                  review={review}
                  onSaved={reloadReview}
                  onCancel={() => setShowEditReview(false)}
                />
              )}
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
                placeholder="Only visible to KwikServe admin…"
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
                disabled={rating === 0 || submittingReview}
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
  // Fixed header row: keeps the Back control visible even after the detail content scrolls,
  // so the customer is never trapped. Sits below the safe-area top inset (Dynamic Island-safe).
  headerRow: {
    paddingHorizontal: Spacing.two,
    paddingTop: Spacing.two,
    alignItems: 'flex-start',
  },
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
  // ── Slice 34: service summary styles ──────────────────────────────────────
  serviceSummaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  serviceIcon: {
    fontSize: 28,
    lineHeight: 34,
  },
  serviceSummaryText: {
    flex: 1,
    gap: Spacing.one,
  },
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
