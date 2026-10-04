/**
 * Get help with this booking (Update 74) — shown when a booking can't be cancelled in the app.
 *
 * It explains why (work started, job complete, a provider we arranged ourselves, or money on the booking),
 * shows the booking reference in the Receipt's format, and offers the support mailbox through the existing
 * SupportLink, whose mailto deliberately carries nothing but the address (src/lib/support.ts). An email is
 * a request, never an automatic cancellation. Every text is DRAFT (src/constants/cancellation-copy.ts).
 */
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams, type Href } from 'expo-router';

import { Spacing } from '@/constants/theme';
import {
  BACK_TO_MY_BOOKINGS,
  ERR_NOT_FOUND,
  HELP_CHAT_LINE,
  HELP_COMPLETED,
  HELP_EMAIL_PROMPT,
  HELP_GENERAL,
  HELP_MONEY,
  HELP_REFERENCE,
  HELP_REFUND_PARAGRAPH,
  HELP_REQUEST_NOTE,
  HELP_TITLE,
  HELP_WORK_STARTED,
} from '@/constants/cancellation-copy';
import { useTheme } from '@/hooks/use-theme';
import { getBookingById, type Booking } from '@/lib/bookings';
import { getPaymentForBooking } from '@/lib/payments';
import { getPaymentAttempts } from '@/lib/attempts';
import { bookingReference, helpSituation, type HelpSituation } from '@/lib/cancellation-rules';
import { Button } from '@/components/ui/button';
import { SupportLink } from '@/components/ui/support-link';
import { Text } from '@/components/ui/text';

const INTRO: Record<HelpSituation, string> = {
  work_started: HELP_WORK_STARTED,
  completed: HELP_COMPLETED,
  money: HELP_MONEY,
  general: HELP_GENERAL,
};

export default function BookingHelpScreen() {
  const theme = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [loaded, setLoaded] = useState(false);
  const [booking, setBooking] = useState<Booking | null>(null);
  const [situation, setSituation] = useState<HelpSituation>('general');

  useEffect(() => {
    let active = true;
    (async () => {
      const b = id ? await getBookingById(id) : null;
      if (b) {
        const p = await getPaymentForBooking(b.id);
        const list = p ? await getPaymentAttempts(p.id) : [];
        if (!active) return;
        setSituation(helpSituation(b, p, list) ?? 'general');
      }
      if (!active) return;
      setBooking(b);
      setLoaded(true);
    })();
    return () => {
      active = false;
    };
  }, [id]);

  const chatOpen =
    booking != null &&
    booking.assigned_provider_id != null &&
    booking.status !== 'completed' &&
    booking.status !== 'cancelled';
  const showRefund = situation === 'completed' || situation === 'money';

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {!loaded ? (
          <Text variant="body" color="textSecondary">
            Loading…
          </Text>
        ) : !booking ? (
          <View style={styles.section}>
            <Text variant="body" accessibilityRole="alert">
              {ERR_NOT_FOUND}
            </Text>
            <Button label={BACK_TO_MY_BOOKINGS} variant="secondary" onPress={() => router.replace('/bookings' as Href)} />
          </View>
        ) : (
          <View style={styles.section}>
            <Text variant="title" accessibilityRole="header">
              {HELP_TITLE}
            </Text>
            <Text variant="body" testID="help-intro">
              {INTRO[situation]}
            </Text>
            <Text variant="label" selectable testID="help-reference">
              {HELP_REFERENCE(bookingReference(booking.id))}
            </Text>
            <SupportLink prompt={HELP_EMAIL_PROMPT} />
            {chatOpen ? (
              <>
                <Text variant="body">{HELP_CHAT_LINE}</Text>
                <Button
                  label="Chat with provider"
                  variant="secondary"
                  onPress={() => router.push(`/booking/chat/${booking.id}` as Href)}
                />
              </>
            ) : null}
            {showRefund ? (
              <Text variant="body" color="textSecondary" testID="help-refund">
                {HELP_REFUND_PARAGRAPH}
              </Text>
            ) : null}
            <Text variant="caption" color="textSecondary">
              {HELP_REQUEST_NOTE}
            </Text>
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
});
