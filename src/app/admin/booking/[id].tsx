/**
 * Admin booking detail screen — lets an admin view a booking's summary,
 * change its status, assign a provider, add internal notes, and manage photos.
 */

import { useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { SERVICES } from '@/constants/services';
import { ALL_STATUSES, STATUS_LABELS, type BookingStatus } from '@/constants/booking-status';
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
import { QuoteCard } from '@/components/ui/quote-card';
import { formatKes } from '@/lib/currency';
import { getApprovedProviders, type ProviderProfile } from '@/lib/providers';
import {
  getBookingPhotos,
  deleteBookingPhoto,
  setPhotoVerified,
  type BookingPhotoView,
} from '@/lib/photos';
import { getBookingActivity, type BookingActivity } from '@/lib/activity';
import { BookingSummaryCard } from '@/components/ui/booking-summary-card';
import { StatusBadge } from '@/components/ui/status-badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { SectionHeader } from '@/components/ui/section-header';
import { Text } from '@/components/ui/text';
import { PhotoGallery } from '@/components/ui/photo-gallery';
import { ActivityTimeline } from '@/components/ui/activity-timeline';
import { ChatThread } from '@/components/ui/chat-thread';

export default function AdminBookingDetailScreen() {
  const theme = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();

  const [booking, setBooking] = useState<Booking | null>(null);
  const [error, setError] = useState('');

  // Assign-provider form state
  const [providerName, setProviderName] = useState('');
  const [providerPhone, setProviderPhone] = useState('');

  // Assign-provider mode toggle: 'manual' = type name/phone; 'inApp' = pick from approved providers
  const [assignMode, setAssignMode] = useState<'manual' | 'inApp'>('manual');

  // Approved providers loaded for in-app assignment mode
  const [approvedProviders, setApprovedProviders] = useState<ProviderProfile[]>([]);

  // Admin notes form state
  const [adminNotes, setAdminNotes] = useState('');

  // Quote form state
  const [amountInput, setAmountInput] = useState('');
  const [shareInput, setShareInput] = useState('');

  // Photos state
  const [photos, setPhotos] = useState<BookingPhotoView[]>([]);

  // Activity timeline state
  const [activity, setActivity] = useState<BookingActivity[]>([]);

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
          setAdminNotes(b.admin_notes ?? '');
          setAmountInput(
            b.quoted_amount?.toString() ??
              SERVICES.find((s) => s.id === b.service_id)?.startingPrice?.toString() ??
              '',
          );
          setShareInput(b.provider_share?.toString() ?? '');
        }
      });
      loadPhotos();
      getBookingActivity(id).then(setActivity);
    }
    // Load approved providers on mount so the in-app list is ready immediately
    getApprovedProviders().then(setApprovedProviders);
  }, [id, loadPhotos]);

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

  // In-app mode: called when admin taps a provider card to assign them
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

  async function handleDelete(p: BookingPhotoView) {
    setError('');
    const result = await deleteBookingPhoto({ id: p.id, photo_url: p.photo_url });
    if (result.ok) {
      loadPhotos();
    } else {
      setError(result.error ?? 'Could not delete photo.');
    }
  }

  async function handleVerify(p: BookingPhotoView) {
    setError('');
    const result = await setPhotoVerified(p.id, !p.is_verified);
    if (result.ok) {
      loadPhotos();
    } else {
      setError(result.error ?? 'Could not update photo.');
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
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text variant="title">Booking Detail</Text>

        {/* Summary */}
        <BookingSummaryCard
          serviceTitle={service?.title ?? booking.service_id}
          address={booking.address}
          scheduledFor={booking.scheduled_for}
          notes={booking.notes ?? ''}
        />

        {/* Current status badge */}
        <View style={styles.badgeRow}>
          <StatusBadge status={booking.status} />
        </View>

        {error ? (
          <Text variant="caption" color="error">
            {error}
          </Text>
        ) : null}

        {/* ── Quote ─────────────────────────────────────────────────────────── */}
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

        {/* ── Update Status ─────────────────────────────────────────────────── */}
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

        {/* ── Assign Provider ───────────────────────────────────────────────── */}
        <SectionHeader title="Assign Provider" />

        {/* Mode toggle: Manual | In-app */}
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

        {/* Manual mode: type name + phone */}
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

        {/* In-app mode: pick from approved providers */}
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
                <Text variant="caption" color="textSecondary">{p.phone ?? '—'}</Text>
              </Card>
            ))}
          </>
        )}

        {/* ── Admin Notes ───────────────────────────────────────────────────── */}
        <SectionHeader title="Admin Notes" />
        <Input
          label="Notes"
          value={adminNotes}
          onChangeText={setAdminNotes}
          placeholder="Internal notes…"
          multiline
        />
        <Button label="Save notes" onPress={handleSaveNotes} />

        {/* ── Photos ────────────────────────────────────────────────────────── */}
        <SectionHeader title="Photos" />
        <PhotoGallery
          photos={photos}
          renderActions={(p) => (
            <>
              <Button label="Delete" variant="ghost" onPress={() => handleDelete(p)} />
              <Button
                label={p.is_verified ? 'Unverify' : 'Verify'}
                onPress={() => handleVerify(p)}
              />
            </>
          )}
        />

        {/* ── Activity ──────────────────────────────────────────────────────── */}
        <SectionHeader title="Activity" />
        <ActivityTimeline events={activity} />

        {/* ── Conversation ──────────────────────────────────────────────────── */}
        {/* ChatThread renders its own "Conversation" header in readonly mode. */}
        <ChatThread bookingId={id} booking={booking} mode="readonly" />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  content: { padding: Spacing.four, gap: Spacing.three },
  badgeRow: { flexDirection: 'row' },
  statusRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  modeTrack: {
    flexDirection: 'row',
    borderRadius: Radii.pill,
    padding: 4,
    gap: 0,
    alignSelf: 'flex-start',
  },
  providerCard: { gap: Spacing.one },
});
