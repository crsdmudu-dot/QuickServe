/**
 * Cancel booking (Update 74) — steps 2 to 5 of the customer's cancellation:
 *   2. the booking and what cancelling it means (consequence lines chosen by its state);
 *   3. an optional reason;
 *   4. one confirmation ("Cancel booking"; "Keep booking" goes back);
 *   5. the result, on the same screen.
 *
 * The server decides (customer_cancel_booking). One request key is made when the screen opens and is
 * reused for every "Try again", so a repeat of a request that already went through only reports
 * "already cancelled". Every text is DRAFT (src/constants/cancellation-copy.ts).
 */
import { useEffect, useState } from 'react';
import { AccessibilityInfo, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams, type Href } from 'expo-router';

import { Radii, Spacing } from '@/constants/theme';
import { CANCEL_REASON_CODES, type CancelReasonCode } from '@/constants/cancellation';
import {
  BACK,
  BACK_TO_BOOKING,
  BACK_TO_MY_BOOKINGS,
  CANCEL_REASON_LABELS,
  CONFIRM_BUTTON,
  CONFIRM_TITLE,
  ERR_COMPLETED,
  ERR_NEEDS_SUPPORT,
  ERR_NETWORK,
  ERR_NOT_FOUND,
  ERR_PAYMENT_IN_PROGRESS,
  ERR_PAYMENT_RECORDED,
  ERR_UNAVAILABLE,
  ERR_WORK_STARTED,
  HELP_BUTTON,
  KEEP_BUTTON,
  PROVIDER_LINE,
  REASON_GROUP_LABEL,
  REASON_HELPER,
  REBOOK_BUTTON,
  RESULT_ALREADY_KWIKSERVE,
  RESULT_ALREADY_YOU,
  RESULT_BODY,
  RESULT_NOTHING_TO_PAY,
  RESULT_PROVIDER_MANUAL,
  RESULT_PROVIDER_TOLD,
  RESULT_QUOTE,
  RESULT_TITLE,
  SENDING_ANNOUNCEMENT,
  TRY_AGAIN,
} from '@/constants/cancellation-copy';
import { useTheme } from '@/hooks/use-theme';
import { useServices } from '@/services/services-provider';
import { getBookingById, type Booking } from '@/lib/bookings';
import { getPaymentForBooking } from '@/lib/payments';
import { getPaymentAttempts } from '@/lib/attempts';
import { newIdempotencyKey } from '@/lib/idempotency';
import { cancelBooking, type CancelRefusal, type CancelResult } from '@/lib/cancellation';
import { consequenceLines, expectedRefusal, type ExpectedRefusal } from '@/lib/cancellation-rules';
import { BookingSummaryCard } from '@/components/ui/booking-summary-card';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';

type Phase =
  | { kind: 'loading' }
  | { kind: 'not_found' }
  | { kind: 'confirm'; error: string | null }
  | { kind: 'sending' }
  | { kind: 'done'; result: Extract<CancelResult, { kind: 'cancelled' | 'already_cancelled' }> }
  | { kind: 'refused'; text: string };

/** The refusal text for a server code, or for the code the app expects the server to give. */
function refusalText(code: CancelRefusal | ExpectedRefusal | 'unavailable'): string {
  switch (code) {
    case 'work_started':
      return ERR_WORK_STARTED;
    case 'completed':
      return ERR_COMPLETED;
    case 'payment_in_progress':
      return ERR_PAYMENT_IN_PROGRESS;
    case 'payment_recorded':
      return ERR_PAYMENT_RECORDED;
    case 'unavailable':
      return ERR_UNAVAILABLE;
    case 'not_found':
      return ERR_NOT_FOUND;
    default:
      return ERR_NEEDS_SUPPORT;
  }
}

function announce(text: string) {
  try {
    AccessibilityInfo.announceForAccessibility(text);
  } catch {
    /* announcements are best-effort */
  }
}

export default function CancelBookingScreen() {
  const theme = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { getServiceBySlug } = useServices();
  // One request key per confirmation screen, reused for every retry (never regenerated on re-render).
  const [requestKey] = useState(() => newIdempotencyKey());
  const [booking, setBooking] = useState<Booking | null>(null);
  const [reason, setReason] = useState<CancelReasonCode | null>(null);
  const [phase, setPhase] = useState<Phase>({ kind: 'loading' });

  useEffect(() => {
    let active = true;
    (async () => {
      const b = id ? await getBookingById(id) : null;
      if (!active) return;
      if (!b) {
        setPhase({ kind: 'not_found' });
        return;
      }
      const p = await getPaymentForBooking(b.id);
      const list = p ? await getPaymentAttempts(p.id) : [];
      if (!active) return;
      setBooking(b);
      if (b.status === 'cancelled') {
        setPhase({ kind: 'done', result: { kind: 'already_cancelled', by: 'you', sameRequest: false } });
        return;
      }
      const refusal = expectedRefusal(b, p, list);
      setPhase(refusal ? { kind: 'refused', text: refusalText(refusal) } : { kind: 'confirm', error: null });
    })();
    return () => {
      active = false;
    };
  }, [id]);

  async function confirm() {
    if (!booking || phase.kind === 'sending') return;
    setPhase({ kind: 'sending' });
    announce(SENDING_ANNOUNCEMENT);
    const r = await cancelBooking(booking.id, reason, requestKey);
    if (r.kind === 'cancelled' || r.kind === 'already_cancelled') {
      setPhase({ kind: 'done', result: r });
      announce(r.kind === 'cancelled' ? RESULT_TITLE : r.by === 'you' ? RESULT_ALREADY_YOU : RESULT_ALREADY_KWIKSERVE);
    } else if (r.kind === 'network') {
      setPhase({ kind: 'confirm', error: ERR_NETWORK });
      announce(ERR_NETWORK);
    } else {
      const text = refusalText(r.kind === 'refused' ? r.code : 'unavailable');
      setPhase({ kind: 'refused', text });
      announce(text);
    }
  }

  function backToBooking() {
    if (router.canGoBack()) router.back();
    else router.replace(`/booking/${id}` as Href);
  }

  const service = booking ? getServiceBySlug(booking.service_id) : null;
  const providerName = booking?.assigned_provider_name?.trim() || null;

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {phase.kind === 'loading' ? (
          <Text variant="body" color="textSecondary">
            Loading…
          </Text>
        ) : phase.kind === 'not_found' || !booking || !service ? (
          <View style={styles.section}>
            <Text variant="body" accessibilityRole="alert">
              {ERR_NOT_FOUND}
            </Text>
            <Button label={BACK_TO_MY_BOOKINGS} variant="secondary" onPress={() => router.replace('/bookings' as Href)} />
          </View>
        ) : phase.kind === 'done' ? (
          <View style={styles.section} testID="cancel-result">
            {phase.result.kind === 'cancelled' ? (
              <>
                <Text variant="title" accessibilityRole="header">
                  {RESULT_TITLE}
                </Text>
                <Text variant="body">
                  {RESULT_BODY(service.title, new Date(booking.scheduled_for).toLocaleDateString())}
                </Text>
                {phase.result.providerNotified ? <Text variant="body">{RESULT_PROVIDER_TOLD}</Text> : null}
                {phase.result.manualProvider ? <Text variant="body">{RESULT_PROVIDER_MANUAL}</Text> : null}
                {phase.result.paymentClosed || booking.quote_status === 'sent' ? (
                  <Text variant="body">{RESULT_QUOTE}</Text>
                ) : null}
                <Text variant="body">{RESULT_NOTHING_TO_PAY}</Text>
              </>
            ) : (
              <Text variant="title" accessibilityRole="header">
                {phase.result.by === 'kwikserve' ? RESULT_ALREADY_KWIKSERVE : RESULT_ALREADY_YOU}
              </Text>
            )}
            <Button testID="cancel-back-to-booking" label={BACK_TO_BOOKING} fullWidth onPress={backToBooking} />
            <Button
              testID="cancel-book-again"
              label={REBOOK_BUTTON}
              variant="secondary"
              fullWidth
              onPress={() => router.replace('/home' as Href)}
            />
          </View>
        ) : phase.kind === 'refused' ? (
          <View style={styles.section} testID="cancel-refused">
            <Text variant="body" accessibilityRole="alert">
              {phase.text}
            </Text>
            <Button
              testID="cancel-get-help"
              label={HELP_BUTTON}
              fullWidth
              onPress={() => router.replace(`/booking/help/${booking.id}` as Href)}
            />
            <Button label={BACK} variant="ghost" fullWidth onPress={backToBooking} />
          </View>
        ) : (
          <View style={styles.section}>
            <Text variant="title" accessibilityRole="header">
              {CONFIRM_TITLE}
            </Text>
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
            {providerName ? <Text variant="body">{PROVIDER_LINE(providerName)}</Text> : null}

            <View style={styles.list} testID="cancel-consequences">
              {consequenceLines(booking, providerName).map((line) => (
                <View key={line} style={styles.listRow}>
                  <Text variant="body" importantForAccessibility="no">
                    •
                  </Text>
                  <Text variant="body" style={styles.listText}>
                    {line}
                  </Text>
                </View>
              ))}
            </View>

            <View accessibilityRole="radiogroup" accessibilityLabel={REASON_GROUP_LABEL} style={styles.reasons}>
              <Text variant="label">{REASON_GROUP_LABEL}</Text>
              <Text variant="caption" color="textSecondary">
                {REASON_HELPER}
              </Text>
              {CANCEL_REASON_CODES.map((code) => {
                const checked = reason === code;
                return (
                  <Pressable
                    key={code}
                    testID={`cancel-reason-${code}`}
                    accessibilityRole="radio"
                    accessibilityLabel={CANCEL_REASON_LABELS[code]}
                    accessibilityState={{ checked, disabled: phase.kind === 'sending' }}
                    disabled={phase.kind === 'sending'}
                    // Tapping the chosen reason again clears it: the reason stays optional.
                    onPress={() => setReason(checked ? null : code)}
                    style={[
                      styles.reason,
                      { borderColor: checked ? theme.primary : theme.border, backgroundColor: checked ? theme.primarySurface : 'transparent' },
                    ]}
                  >
                    <View
                      style={[styles.radio, { borderColor: checked ? theme.primary : theme.textTertiary }]}
                      importantForAccessibility="no"
                    >
                      {checked ? <View style={[styles.radioDot, { backgroundColor: theme.primary }]} /> : null}
                    </View>
                    <Text variant="body" style={styles.listText}>
                      {CANCEL_REASON_LABELS[code]}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            {phase.kind === 'confirm' && phase.error ? (
              <Text variant="body" color="error" accessibilityRole="alert" testID="cancel-error">
                {phase.error}
              </Text>
            ) : null}
            <Button
              testID="cancel-confirm"
              label={phase.kind === 'confirm' && phase.error ? TRY_AGAIN : CONFIRM_BUTTON}
              fullWidth
              size="lg"
              loading={phase.kind === 'sending'}
              onPress={() => void confirm()}
            />
            <Button
              testID="cancel-keep"
              label={KEEP_BUTTON}
              variant="ghost"
              fullWidth
              disabled={phase.kind === 'sending'}
              onPress={backToBooking}
            />
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  content: { padding: Spacing.four, gap: Spacing.three },
  section: { gap: Spacing.three },
  list: { gap: Spacing.two },
  listRow: { flexDirection: 'row', gap: Spacing.two },
  listText: { flex: 1 },
  reasons: { gap: Spacing.two },
  reason: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingHorizontal: Spacing.three,
    borderWidth: 1,
    borderRadius: Radii.md,
  },
  radio: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  radioDot: { width: 10, height: 10, borderRadius: 5 },
});
