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
import { SafeAreaView } from 'react-native-safe-area-context';

import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { getBookingById, type Booking } from '@/lib/bookings';
import { ChatThread } from '@/components/ui/chat-thread';
import { Text } from '@/components/ui/text';

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
        <Text variant="body" color="textSecondary">Loading…</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]}>
      <ChatThread bookingId={id} booking={booking} mode="participant" />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({ safe: { flex: 1, padding: Spacing.four } });
