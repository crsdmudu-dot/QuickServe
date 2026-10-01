/**
 * Provider chat screen — renders a full ChatThread for the service provider
 * to message the customer about this booking.
 *
 * Loads the booking by id (from URL params) via getBookingById(), then
 * hands the data to ChatThread (mode="participant").  ChatThread handles
 * all send-gating by booking status and user identity — nothing extra is
 * needed here.
 */

import { useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet } from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useTheme } from '@/hooks/use-theme';
import { getBookingById, type Booking } from '@/lib/bookings';
import { ChatThread } from '@/components/ui/chat-thread';
import { Text } from '@/components/ui/text';
import { Spacing } from '@/constants/theme';

export default function ProviderChatScreen() {
  const theme = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [booking, setBooking] = useState<Booking | null>(null);

  useEffect(() => {
    if (id) getBookingById(id).then(setBooking);
  }, [id]);

  if (!booking) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]}>
        <Text variant="body" color="textSecondary" style={styles.loading}>Loading…</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]}>
      {/* The message box sits at the bottom of the chat. When the keyboard opens, this view adds
          bottom padding equal to the keyboard's height, so the thread gets shorter and the message
          box and Send stay just above the keyboard. automaticOffset makes it measure its own
          position on screen (below the header), so no header height is hard-coded. It lives here,
          not inside ChatThread, so the admin website (read-only chat) does not load the keyboard
          library (see src/app/_layout.tsx). */}
      <KeyboardAvoidingView behavior="padding" automaticOffset style={styles.keyboard} testID="chat-keyboard-avoiding">
        <ChatThread bookingId={id} booking={booking} mode="participant" />
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  keyboard: { flex: 1 },
  loading: { padding: Spacing.four },
});
