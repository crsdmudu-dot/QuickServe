/**
 * Admin payments dashboard — lists all payments with status overrides.
 *
 * Mirrors the structure of admin/index.tsx (SafeAreaView, header, FlatList,
 * Card rows).  The status is a Stack-pushed screen so a back button is
 * provided by the navigator automatically.
 */

import { useEffect, useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';

import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import {
  adminGetAllPayments,
  adminOverridePaymentStatus,
  type Payment,
  type PaymentStatus,
} from '@/lib/payments';
import { formatKes } from '@/lib/currency';
import { PaymentStatusBadge } from '@/components/ui/payment-status-badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Text } from '@/components/ui/text';

const ALL_PAYMENT_STATUSES: PaymentStatus[] = ['pending', 'paid', 'refunded', 'cancelled'];

export default function AdminPaymentsScreen() {
  const theme = useTheme();

  const [payments, setPayments] = useState<Payment[]>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    adminGetAllPayments().then(setPayments);
  }, []);

  async function handleOverride(paymentId: string, status: PaymentStatus) {
    setError('');
    const result = await adminOverridePaymentStatus(paymentId, status);
    if (result.ok) {
      setPayments((prev) =>
        prev.map((p) => (p.id === paymentId ? { ...p, status } : p)),
      );
    } else {
      setError(result.error ?? 'Could not update payment status.');
    }
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]}>
      {/* Header */}
      <View style={styles.header}>
        <Text variant="title">Payments</Text>
        <Button
          label="Payment attempts"
          variant="ghost"
          onPress={() => router.push('/admin/payment-attempts')}
        />
      </View>

      {error ? (
        <Text variant="caption" color="error" style={styles.errorText}>
          {error}
        </Text>
      ) : null}

      {payments.length === 0 ? (
        <EmptyState
          icon="💳"
          title="No payments yet"
          message="Payments will appear here once customers accept quotes."
        />
      ) : (
        <FlatList
          data={payments}
          keyExtractor={(p) => p.id}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          renderItem={({ item: p }) => (
            <Card style={styles.card} elevation="e1">
              {/* Amount + status in a clean row */}
              <View style={styles.amountRow}>
                <Text variant="heading">{formatKes(p.amount)}</Text>
                <PaymentStatusBadge status={p.status} />
              </View>

              {/* Split breakdown */}
              <Text variant="caption" color="textSecondary">
                {`Provider ${formatKes(p.provider_share)} · QuickServe ${formatKes(p.quickserve_share)}`}
              </Text>

              {/* Payment method */}
              <Text variant="caption" color="textSecondary">
                {`Method: ${p.payment_method ?? '—'}`}
              </Text>

              {/* Ref + date */}
              <Text variant="caption" color="textSecondary">
                {`#${p.booking_id.slice(0, 8)} · ${new Date(p.created_at).toLocaleDateString()}`}
              </Text>

              {/* Status override buttons — tidy action row */}
              <View style={styles.actions}>
                {ALL_PAYMENT_STATUSES.map((s) => (
                  <Button
                    key={s}
                    label={s.charAt(0).toUpperCase() + s.slice(1)}
                    variant={p.status === s ? 'secondary' : 'ghost'}
                    onPress={() => handleOverride(p.id, s)}
                  />
                ))}
              </View>
            </Card>
          )}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.three,
    paddingBottom: Spacing.two,
  },
  errorText: {
    paddingHorizontal: Spacing.four,
  },
  list: { padding: Spacing.four, gap: Spacing.three },
  card: { gap: Spacing.two },
  amountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two, marginTop: Spacing.two },
});
