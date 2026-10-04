/**
 * Cancel a booking: choose which (Update 74, OD-74-8 DEFAULT).
 *
 * The Terms screen links here, so a customer who has not accepted the current Terms can still cancel a
 * booking, as account deletion stays reachable (src/auth/root-redirect.ts exempts booking/cancel and
 * booking/help while TERMS_GATE_EXEMPTS_CANCELLATION is on). It lists the customer's own bookings that the
 * app expects can be cancelled; the confirmation screen and the server decide again. Texts are DRAFT.
 */
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, type Href } from 'expo-router';

import { Spacing } from '@/constants/theme';
import { BACK, LIST_EMPTY, LIST_INTRO, LIST_OPEN, LIST_TITLE } from '@/constants/cancellation-copy';
import { useTheme } from '@/hooks/use-theme';
import { useServices } from '@/services/services-provider';
import { getCustomerBookings, type Booking } from '@/lib/bookings';
import { cancellationOption } from '@/lib/cancellation-rules';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Text } from '@/components/ui/text';

export default function ChooseBookingToCancelScreen() {
  const theme = useTheme();
  const { getServiceBySlug } = useServices();
  const [bookings, setBookings] = useState<Booking[] | null>(null);

  useEffect(() => {
    let active = true;
    getCustomerBookings(0, 50).then((all) => {
      // Payment state is checked on the confirmation screen; here only the status and dispatch decide.
      if (active) setBookings(all.filter((b) => cancellationOption(b, null, []) === 'cancel'));
    });
    return () => {
      active = false;
    };
  }, []);

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text variant="title" accessibilityRole="header">
          {LIST_TITLE}
        </Text>
        <Text variant="body" color="textSecondary">
          {LIST_INTRO}
        </Text>
        {bookings === null ? (
          <Text variant="body" color="textSecondary">
            Loading…
          </Text>
        ) : bookings.length === 0 ? (
          <Text variant="body" testID="cancel-list-empty">
            {LIST_EMPTY}
          </Text>
        ) : (
          bookings.map((b) => (
            <Card key={b.id} style={styles.card}>
              <View style={styles.cardBody}>
                <Text variant="label" weight="semibold">
                  {getServiceBySlug(b.service_id).title}
                </Text>
                <Text variant="caption" color="textSecondary">
                  {new Date(b.scheduled_for).toLocaleString()}
                </Text>
                <Button
                  testID={`cancel-list-open-${b.id}`}
                  label={LIST_OPEN}
                  variant="secondary"
                  onPress={() => router.push(`/booking/cancel/${b.id}` as Href)}
                />
              </View>
            </Card>
          ))
        )}
        {/* This screen can be the first of the booking stack (opened from the Terms screen), where the
            native header has no back arrow, so it carries its own Back control. */}
        <Button
          testID="cancel-list-back"
          label={BACK}
          variant="ghost"
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/home' as Href))}
        />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  content: { padding: Spacing.four, gap: Spacing.three },
  card: { padding: Spacing.three },
  cardBody: { gap: Spacing.two },
});
