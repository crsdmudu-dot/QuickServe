/**
 * Receipt screen — display-only view of the payment receipt for a booking.
 *
 * Loads the booking and payment via existing reads (getBookingById +
 * getPaymentForBooking), builds a Receipt via buildReceipt (pure, no mutation),
 * and renders it with ReceiptView.
 *
 * Download/Share are placeholder-disabled (canDownloadReceipt === false).
 * NO payment/wallet/promo mutation, NO charge recomputation.
 *
 * Slice 34: new pushed route (`/booking/receipt?id=<bookingId>`).
 */

import { useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack } from 'expo-router';

import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { getBookingById, type Booking } from '@/lib/bookings';
import { getPaymentForBooking, type Payment } from '@/lib/payments';
import { buildReceipt } from '@/lib/receipts';
import { Skeleton } from '@/components/ui/skeleton';
import { Text } from '@/components/ui/text';
import { ReceiptView } from '@/components/customer/receipt-view';

export default function ReceiptScreen() {
  const theme = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();

  const [booking, setBooking] = useState<Booking | null>(null);
  const [payment, setPayment] = useState<Payment | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    Promise.all([getBookingById(id), getPaymentForBooking(id)]).then(([b, p]) => {
      setBooking(b ?? null);
      setPayment(p);
      setLoading(false);
    });
  }, [id]);

  return (
    <>
      {/* Set the header title for this screen */}
      <Stack.Screen options={{ title: 'Receipt' }} />
      <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]}>
        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
        >
          {loading ? (
            /* Loading skeleton */
            <View style={styles.skeletons}>
              <Skeleton height={100} radius={12} />
              <Skeleton height={140} radius={12} />
              <Skeleton height={60} radius={12} />
            </View>
          ) : payment == null ? (
            /* No payment yet */
            <View style={styles.emptyContainer}>
              <Text variant="title" style={styles.emptyTitle}>No receipt yet</Text>
              <Text variant="body" color="textSecondary">
                A receipt will appear here once payment has been made.
              </Text>
            </View>
          ) : (
            /* Receipt view — display-only */
            <ReceiptView receipt={buildReceipt({ booking, payment })} />
          )}
        </ScrollView>
      </SafeAreaView>
    </>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  content: { padding: Spacing.four, gap: Spacing.four },
  skeletons: { gap: Spacing.three },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
    paddingVertical: Spacing.six,
  },
  emptyTitle: { textAlign: 'center' },
});
