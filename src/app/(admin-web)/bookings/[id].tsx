/**
 * src/app/(admin-web)/bookings/[id].tsx — Web Admin Booking Detail
 *
 * Desktop two-column layout:
 *   Left  — booking ops: summary, status controls, assign provider, admin notes, quote.
 *   Right — evidence/oversight: payment, photos, activity timeline, conversation.
 *
 * Reuses all lib helpers and UI components from the mobile admin detail screen
 * (src/app/admin/booking/[id].tsx) — only the layout changes.
 *
 * RN/RN-web safe — no DOM-only APIs.
 */

import { useLocalSearchParams, router, type Href } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';

import { ALL_STATUSES, STATUS_LABELS, type BookingStatus } from '@/constants/booking-status';
import { useServices } from '@/services/services-provider';
import { Radii, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import {
  getBookingById,
  updateBookingStatus,
  assignProvider,
  updateAdminNotes,
  type Booking,
} from '@/lib/bookings';
import {
  setBookingQuote,
  computeQuickServeShare,
  validateQuoteInput,
  canEditQuote,
} from '@/lib/quotes';
import { getPaymentForBooking, type Payment } from '@/lib/payments';
import { getApprovedProviders, type ProviderProfile } from '@/lib/providers';
import {
  getBookingPhotos,
  deleteBookingPhoto,
  setPhotoVerified,
  type BookingPhotoView,
} from '@/lib/photos';
import { getBookingActivity, type BookingActivity } from '@/lib/activity';
import { formatKes } from '@/lib/currency';
import { PageMeta } from '@/components/admin-web/page-meta';
import { StatusBadge } from '@/components/ui/status-badge';
import { PaymentStatusBadge } from '@/components/ui/payment-status-badge';
import { QuoteCard } from '@/components/ui/quote-card';
import { PhotoGallery } from '@/components/ui/photo-gallery';
import { ActivityTimeline } from '@/components/ui/activity-timeline';
import { ChatThread } from '@/components/ui/chat-thread';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { SectionHeader } from '@/components/ui/section-header';
import { Text } from '@/components/ui/text';
import { DestinationSummary } from '@/components/ui/destination-summary';
import { AdminLiveLocation } from '@/components/ui/admin-live-location';
import { AdminWalletPanel } from '@/components/admin-web/admin-wallet-panel';
import { InternalNotesPanel } from '@/components/admin-web/operations/internal-notes-panel';

// ── Layout breakpoint ──────────────────────────────────────────────────────

/** Minimum viewport width to show the two-column desktop layout. */
const WIDE_BREAKPOINT = 900;

// ── Screen ─────────────────────────────────────────────────────────────────

export default function AdminWebBookingDetailScreen() {
  const theme = useTheme();
  const { width } = useWindowDimensions();
  const isWide = width >= WIDE_BREAKPOINT;
  const { getServiceBySlug } = useServices();

  const { id } = useLocalSearchParams<{ id: string }>();

  // ── Core booking state ─────────────────────────────────────────────────
  const [booking, setBooking] = useState<Booking | null>(null);
  const [error, setError] = useState('');

  // ── Assign-provider state ──────────────────────────────────────────────
  const [assignMode, setAssignMode] = useState<'manual' | 'inApp'>('manual');
  const [providerName, setProviderName] = useState('');
  const [providerPhone, setProviderPhone] = useState('');
  const [approvedProviders, setApprovedProviders] = useState<ProviderProfile[]>([]);

  // ── Admin notes state ──────────────────────────────────────────────────
  const [adminNotes, setAdminNotes] = useState('');

  // ── Quote state ────────────────────────────────────────────────────────
  const [amountInput, setAmountInput] = useState('');
  const [shareInput, setShareInput] = useState('');

  // ── Right column state ─────────────────────────────────────────────────
  const [payment, setPayment] = useState<Payment | null>(null);
  const [photos, setPhotos] = useState<BookingPhotoView[]>([]);
  const [activity, setActivity] = useState<BookingActivity[]>([]);

  // ── Photo reload helper ────────────────────────────────────────────────
  const loadPhotos = useCallback(() => {
    if (id) getBookingPhotos(id).then(setPhotos);
  }, [id]);

  // ── Initial data load ──────────────────────────────────────────────────
  useEffect(() => {
    if (!id) return;

    getBookingById(id).then((b) => {
      if (b) {
        setBooking(b);
        setAdminNotes(b.admin_notes ?? '');
        setAmountInput(
          b.quoted_amount?.toString() ??
            getServiceBySlug(b.service_id).startingPrice?.toString() ??
            '',
        );
        setShareInput(b.provider_share?.toString() ?? '');
      }
    });

    getPaymentForBooking(id).then(setPayment);
    loadPhotos();
    getBookingActivity(id).then(setActivity);
    getApprovedProviders().then(setApprovedProviders);
  }, [id, loadPhotos]);

  // ── Action handlers ────────────────────────────────────────────────────

  async function handleStatusPress(status: BookingStatus) {
    if (!id) return;
    setError('');
    const result = await updateBookingStatus(id, status);
    if (result.ok) {
      setBooking((prev) => (prev ? { ...prev, status } : prev));
    } else {
      setError(result.error ?? 'Could not update status.');
    }
  }

  async function handleAssign() {
    if (!id) return;
    setError('');
    const result = await assignProvider(id, { name: providerName, phone: providerPhone });
    if (result.ok) {
      setBooking((prev) =>
        prev
          ? {
              ...prev,
              status: 'provider_assigned',
              assigned_provider_name: providerName,
              assigned_provider_phone: providerPhone,
            }
          : prev,
      );
    } else {
      setError(result.error ?? 'Could not assign provider.');
    }
  }

  async function handleAssignInApp(p: ProviderProfile) {
    if (!id) return;
    setError('');
    const result = await assignProvider(id, {
      providerId: p.id,
      name: p.full_name ?? '',
      phone: p.phone ?? '',
    });
    if (result.ok) {
      setBooking((prev) =>
        prev
          ? {
              ...prev,
              status: 'provider_assigned',
              assigned_provider_id: p.id,
              assigned_provider_name: p.full_name ?? '',
              assigned_provider_phone: p.phone ?? '',
            }
          : prev,
      );
    } else {
      setError(result.error ?? 'Could not assign provider.');
    }
  }

  async function handleSaveNotes() {
    if (!id) return;
    setError('');
    const result = await updateAdminNotes(id, adminNotes);
    if (!result.ok) {
      setError(result.error ?? 'Could not save notes.');
    }
  }

  async function handleSendQuote() {
    if (!booking) return;
    const amount = Number(amountInput);
    const share = Number(shareInput);
    const validationError = validateQuoteInput(amount, share);
    if (validationError) {
      setError(validationError);
      return;
    }
    setError('');
    const result = await setBookingQuote(booking.id, amount, share);
    if (result.ok) {
      setBooking((prev) =>
        prev
          ? { ...prev, quoted_amount: amount, provider_share: share, quote_status: 'sent' }
          : prev,
      );
    } else {
      setError(result.error ?? 'Could not send quote.');
    }
  }

  async function handleDeletePhoto(p: BookingPhotoView) {
    setError('');
    const result = await deleteBookingPhoto({ id: p.id, photo_url: p.photo_url });
    if (result.ok) {
      loadPhotos();
    } else {
      setError(result.error ?? 'Could not delete photo.');
    }
  }

  async function handleVerifyPhoto(p: BookingPhotoView) {
    setError('');
    const result = await setPhotoVerified(p.id, !p.is_verified);
    if (result.ok) {
      loadPhotos();
    } else {
      setError(result.error ?? 'Could not update photo.');
    }
  }

  // ── Loading / not-found guard ──────────────────────────────────────────

  if (!booking) {
    return (
      <View style={styles.center}>
        <Text variant="body" color="textSecondary">
          Loading…
        </Text>
      </View>
    );
  }

  const service = getServiceBySlug(booking.service_id);

  // ── Left column content ────────────────────────────────────────────────

  const leftColumn = (
    <View style={styles.column}>
      {/* Summary */}
      <SectionHeader title="Booking Summary" />
      <Card>
        <View style={styles.summaryContent}>
          <Text variant="heading" weight="semibold">
            {service.title}
          </Text>
          <StatusBadge status={booking.status} />
          <Text variant="body" color="textSecondary">
            {booking.address}
          </Text>
          <Text variant="caption" color="textTertiary">
            {new Date(booking.scheduled_for).toLocaleString()}
          </Text>
          {booking.notes ? (
            <Text variant="caption" color="textSecondary">
              {booking.notes}
            </Text>
          ) : null}
        </View>
      </Card>

      {/* Destination */}
      <SectionHeader title="Destination" />
      <DestinationSummary input={booking} />

      {/* Live location (read-only oversight) */}
      {(booking.status === 'on_the_way' || booking.status === 'in_progress') && (
        <>
          <SectionHeader title="Live location" />
          <AdminLiveLocation booking={booking} />
        </>
      )}

      {error ? (
        <Text variant="caption" color="error">
          {error}
        </Text>
      ) : null}

      {/* Quote */}
      <SectionHeader title="Quote" />
      <QuoteCard
        amount={booking.quoted_amount}
        quoteStatus={booking.quote_status}
        split={
          booking.quoted_amount != null && booking.provider_share != null
            ? {
                providerShare: booking.provider_share,
                quickserveShare: computeQuickServeShare(
                  booking.quoted_amount,
                  booking.provider_share,
                ),
              }
            : undefined
        }
      />
      {canEditQuote(booking.quote_status) && (
        <>
          <Input
            label="Amount (KES)"
            value={amountInput}
            onChangeText={setAmountInput}
            placeholder="e.g. 3000"
            keyboardType="numeric"
          />
          <Input
            label="Provider share (KES)"
            value={shareInput}
            onChangeText={setShareInput}
            placeholder="e.g. 2100"
            keyboardType="numeric"
          />
          {Number.isFinite(Number(amountInput)) &&
            Number.isFinite(Number(shareInput)) &&
            amountInput !== '' &&
            shareInput !== '' && (
              <Text variant="caption" color="textSecondary">
                {`QuickServe: ${formatKes(computeQuickServeShare(Number(amountInput), Number(shareInput)))}`}
              </Text>
            )}
          <Button label="Send quote" onPress={handleSendQuote} />
        </>
      )}

      {/* Update Status */}
      <SectionHeader title="Update Status" />
      <View style={styles.statusRow}>
        {ALL_STATUSES.map((s) => (
          <Button
            key={s}
            label={STATUS_LABELS[s]}
            variant={booking.status === s ? 'secondary' : 'ghost'}
            onPress={() => handleStatusPress(s)}
          />
        ))}
      </View>

      {/* Assign Provider */}
      <SectionHeader title="Assign Provider" />
      <View style={[styles.modeTrack, { backgroundColor: theme.backgroundElement }]}>
        <Button
          label="Manual"
          variant={assignMode === 'manual' ? 'secondary' : 'ghost'}
          onPress={() => setAssignMode('manual')}
        />
        <Button
          label="In-app"
          variant={assignMode === 'inApp' ? 'secondary' : 'ghost'}
          onPress={() => setAssignMode('inApp')}
        />
      </View>

      {assignMode === 'manual' && (
        <>
          <Input
            label="Provider name"
            value={providerName}
            onChangeText={setProviderName}
            placeholder="Full name"
          />
          <Input
            label="Provider phone"
            value={providerPhone}
            onChangeText={setProviderPhone}
            placeholder="Phone number"
            keyboardType="phone-pad"
          />
          <Button label="Assign" onPress={handleAssign} />
        </>
      )}

      {assignMode === 'inApp' && (
        <>
          {approvedProviders.length === 0 && (
            <Text variant="caption" color="textSecondary">
              No approved providers available.
            </Text>
          )}
          {approvedProviders.map((p) => (
            <Card key={p.id} onPress={() => handleAssignInApp(p)} style={styles.providerCard}>
              <Text variant="heading">{p.full_name ?? 'Unknown'}</Text>
              <Text variant="caption" color="textSecondary">
                {p.phone ?? '—'}
              </Text>
            </Card>
          ))}
        </>
      )}

      {/* Admin Notes */}
      <SectionHeader title="Admin Notes" />
      <Input
        label="Notes"
        value={adminNotes}
        onChangeText={setAdminNotes}
        placeholder="Internal notes…"
        multiline
      />
      <Button label="Save notes" onPress={handleSaveNotes} />

      {/* Customer wallet — balance, history, and audited adjustment */}
      <AdminWalletPanel customerId={booking.customer_id} />

      {/* Operations — internal notes for this booking (admin-only, additive) */}
      <InternalNotesPanel subjectType="booking" subjectId={id} />

      {/* Operations — create a support case linked to this booking */}
      <SectionHeader title="Support case" />
      <Button
        label="Create support case"
        variant="secondary"
        onPress={() =>
          router.push(
            `/(admin-web)/operations/new?booking_id=${id}` as Href,
          )
        }
      />
    </View>
  );

  // ── Right column content ───────────────────────────────────────────────

  const rightColumn = (
    <View style={styles.column}>
      {/* Payment */}
      <SectionHeader title="Payment" />
      {payment ? (
        <Card>
          <View style={styles.paymentContent}>
            <Text variant="heading" weight="semibold">
              {formatKes(payment.amount)}
            </Text>
            <PaymentStatusBadge status={payment.status} />
          </View>
        </Card>
      ) : (
        <Text variant="caption" color="textSecondary">
          No payment record yet.
        </Text>
      )}

      {/* Photos */}
      <SectionHeader title="Photos / Evidence" />
      <PhotoGallery
        photos={photos}
        renderActions={(p) => (
          <>
            <Button label="Delete" variant="ghost" onPress={() => handleDeletePhoto(p)} />
            <Button
              label={p.is_verified ? 'Unverify' : 'Verify'}
              onPress={() => handleVerifyPhoto(p)}
            />
          </>
        )}
      />

      {/* Activity */}
      <SectionHeader title="Activity" />
      <ActivityTimeline events={activity} />

      {/* Conversation oversight (readonly) */}
      <ChatThread bookingId={id} booking={booking} mode="readonly" />
    </View>
  );

  // ── Render ─────────────────────────────────────────────────────────────

  if (isWide) {
    // Desktop: two-column side-by-side layout
    return (
      <View style={styles.twoCol}>
        <PageMeta title="Booking detail" />
        <ScrollView
          style={styles.colScroll}
          contentContainerStyle={styles.colContent}
          showsVerticalScrollIndicator={false}>
          {leftColumn}
        </ScrollView>
        <View style={[styles.colDivider, { backgroundColor: theme.border }]} />
        <ScrollView
          style={styles.colScroll}
          contentContainerStyle={styles.colContent}
          showsVerticalScrollIndicator={false}>
          {rightColumn}
        </ScrollView>
      </View>
    );
  }

  // Narrow: single-column stacked layout
  return (
    <View style={styles.singleCol}>
      <PageMeta title="Booking detail" />
      {leftColumn}
      {rightColumn}
    </View>
  );
}

// ── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.four,
  },
  twoCol: {
    flex: 1,
    flexDirection: 'row',
  },
  colScroll: {
    flex: 1,
  },
  colContent: {
    padding: Spacing.three,
    gap: Spacing.three,
  },
  colDivider: {
    width: StyleSheet.hairlineWidth,
  },
  singleCol: {
    gap: Spacing.three,
    padding: Spacing.three,
  },
  column: {
    gap: Spacing.three,
  },
  summaryContent: {
    gap: Spacing.two,
  },
  paymentContent: {
    gap: Spacing.two,
  },
  statusRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  modeTrack: {
    flexDirection: 'row',
    borderRadius: Radii.pill,
    padding: 4,
    alignSelf: 'flex-start',
  },
  providerCard: {
    gap: Spacing.one,
  },
});
