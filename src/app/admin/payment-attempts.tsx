/**
 * Admin payment-attempts screen — lists all payment attempts across every payment.
 *
 * Mirrors the structure of admin/payments.tsx (SafeAreaView, header, FlatList,
 * Card rows).  Admin can confirm or cancel pending/initiated attempts from here.
 * The Stack navigator supplies a back button automatically.
 */

import { useEffect, useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import {
  adminGetPaymentAttempts,
  adminConfirmAttempt,
  adminCancelAttempt,
  type PaymentAttempt,
} from '@/lib/attempts';
import { formatKes } from '@/lib/currency';
import { AttemptStatusBadge } from '@/components/ui/attempt-status-badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Text } from '@/components/ui/text';

export default function AdminPaymentAttemptsScreen() {
  const theme = useTheme();

  const [attempts, setAttempts] = useState<PaymentAttempt[]>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    adminGetPaymentAttempts().then(setAttempts);
  }, []);

  async function handleConfirm(id: string) {
    setError('');
    const r = await adminConfirmAttempt(id);
    if (r.ok) setAttempts(await adminGetPaymentAttempts());
    else setError(r.error ?? 'Could not confirm payment.');
  }

  async function handleCancel(id: string) {
    setError('');
    const r = await adminCancelAttempt(id);
    if (r.ok) setAttempts(await adminGetPaymentAttempts());
    else setError(r.error ?? 'Could not cancel attempt.');
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]}>
      {/* Header */}
      <View style={styles.header}>
        <Text variant="title">Payment attempts</Text>
      </View>

      {error ? (
        <Text variant="caption" color="error" style={styles.errorText}>
          {error}
        </Text>
      ) : null}

      <FlatList
        data={attempts}
        keyExtractor={(a) => a.id}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <EmptyState
            icon="📲"
            title="No payment attempts"
            message="Customer payment attempts will appear here."
          />
        }
        renderItem={({ item: a }) => (
          <Card style={styles.card} elevation="e1">
            {/* Amount + status in a clean row */}
            <View style={styles.amountRow}>
              <Text variant="heading">{formatKes(a.amount)}</Text>
              <AttemptStatusBadge status={a.status} />
            </View>

            {/* Provider + phone */}
            <Text variant="caption" color="textSecondary">
              {`${a.provider.toUpperCase()} · ${a.phone ?? '—'}`}
            </Text>

            {/* Technical metadata wrapped in a surfaceMuted block */}
            <View style={[styles.metaBlock, { backgroundColor: theme.surfaceMuted }]}>
              {/* External reference */}
              <Text variant="caption" color="textSecondary">
                {`Ref: ${a.external_reference ?? '—'}`}
              </Text>

              {a.checkout_request_id ? (
                <Text variant="caption" color="textSecondary">{`Checkout: ${a.checkout_request_id}`}</Text>
              ) : null}
              {a.result_code != null ? (
                <Text variant="caption" color="textSecondary">{`Result: ${a.result_code} · ${a.result_desc ?? ''}`}</Text>
              ) : null}
              {a.callback_received_at ? (
                <Text variant="caption" color="textSecondary">{`Callback: ${new Date(a.callback_received_at).toLocaleString()}`}</Text>
              ) : null}
            </View>

            {/* Payment ID + date */}
            <Text variant="caption" color="textSecondary">
              {`#${a.payment_id.slice(0, 8)} · ${new Date(a.created_at).toLocaleDateString()}`}
            </Text>

            {/* Actions — only shown for pending/initiated attempts */}
            {(a.status === 'pending' || a.status === 'initiated') && (
              <View style={styles.actions}>
                <Button label="Confirm" onPress={() => handleConfirm(a.id)} />
                <Button
                  label="Cancel"
                  variant="ghost"
                  onPress={() => handleCancel(a.id)}
                />
              </View>
            )}
          </Card>
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: {
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
  metaBlock: {
    borderRadius: 8,
    padding: Spacing.two,
    gap: Spacing.one,
  },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two, marginTop: Spacing.two },
});
