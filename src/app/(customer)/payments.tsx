/**
 * My Payments screen — shows the signed-in customer's payment history.
 *
 * Loads payments on mount via getMyPayments(), renders each as a pressable
 * Card with the formatted KES amount, a PaymentStatusBadge, and the date.
 * Tapping a card navigates to the booking detail screen for that payment.
 * When there are no payments an EmptyState is shown instead.
 *
 * CRITICAL: provider_share and quickserve_share are NEVER rendered here.
 * The customer only sees the total amount and payment status.
 */

import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { FlatList, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { getMyPayments, type Payment } from '@/lib/payments';
import { formatKes } from '@/lib/currency';
import { PaymentStatusBadge } from '@/components/ui/payment-status-badge';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Text } from '@/components/ui/text';

export default function CustomerPaymentsScreen() {
  const theme = useTheme();
  const [payments, setPayments] = useState<Payment[]>([]);

  useEffect(() => {
    getMyPayments().then(setPayments);
  }, []);

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]}>
      <Text variant="title" style={styles.heading}>
        My Payments
      </Text>

      {payments.length === 0 ? (
        <EmptyState
          icon="💳"
          title="No payments yet"
          message="Your payments will appear here once you have a quote."
        />
      ) : (
        <FlatList
          data={payments}
          keyExtractor={(p) => p.id}
          contentContainerStyle={styles.list}
          renderItem={({ item: p }) => (
            <Card onPress={() => router.push(`/booking/${p.booking_id}`)} style={styles.card}>
              <Text variant="heading">{formatKes(p.amount)}</Text>
              <PaymentStatusBadge status={p.status} />
              <Text variant="caption" color="textSecondary">
                {new Date(p.created_at).toLocaleDateString()}
              </Text>
            </Card>
          )}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  heading: { paddingHorizontal: Spacing.four, paddingTop: Spacing.three },
  list: { padding: Spacing.four, gap: Spacing.three },
  card: { gap: Spacing.two },
});
