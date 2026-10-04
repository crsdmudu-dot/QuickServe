/**
 * BookingCancelActions — Update 74: the booking screen's "Cancel booking" or "Get help with this booking".
 *
 * Which one shows is decided by the pure mirror of the server rule (src/lib/cancellation-rules.ts), using
 * the booking, payment and attempts the booking screen has already loaded. It is only a hint: the server
 * decides again when the customer confirms. A cancelled booking shows "Book again" instead.
 */
import { router, type Href } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { Spacing } from '@/constants/theme';
import { CANCEL_BUTTON, HELP_BUTTON, REBOOK_BUTTON } from '@/constants/cancellation-copy';
import {
  cancellationOption,
  type CancelAttempt,
  type CancelBooking,
  type CancelPayment,
} from '@/lib/cancellation-rules';
import { Button } from '@/components/ui/button';

export type BookingCancelActionsProps = {
  booking: CancelBooking;
  payment: CancelPayment;
  attempts: readonly CancelAttempt[];
};

export function BookingCancelActions({ booking, payment, attempts }: BookingCancelActionsProps) {
  const option = cancellationOption(booking, payment, attempts);
  return (
    <View style={styles.wrap}>
      {option === 'cancel' ? (
        <Button
          testID="booking-cancel"
          label={CANCEL_BUTTON}
          variant="secondary"
          fullWidth
          onPress={() => router.push(`/booking/cancel/${booking.id}` as Href)}
        />
      ) : option === 'help' ? (
        <Button
          testID="booking-help"
          label={HELP_BUTTON}
          variant="secondary"
          fullWidth
          onPress={() => router.push(`/booking/help/${booking.id}` as Href)}
        />
      ) : (
        <Button
          testID="booking-rebook"
          label={REBOOK_BUTTON}
          variant="secondary"
          fullWidth
          onPress={() => router.push('/home' as Href)}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: Spacing.two },
});
