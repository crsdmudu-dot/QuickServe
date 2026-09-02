/**
 * Admin payment-attempts screen — lists all payment attempts across every payment.
 *
 * Mirrors the structure of admin/payments.tsx (SafeAreaView, header, FlatList, Card rows).
 *
 * Migration 0045 removed both evidence-free admin actions. Confirming an attempt now asserts
 * "this external collection HAPPENED" and requires the collected amount, a note, and — for
 * non-cash providers — the provider's transaction reference, which becomes the authoritative
 * settlement identity. The old Cancel asserted "no money moved" with no evidence at all; it is
 * replaced by an explicit no-collection reconciliation that requires a note.
 *
 * The backend remains the sole authority for the external amount due, attempt eligibility,
 * amount equality, booking completion and settlement-reference uniqueness. The checks in this
 * screen only prevent obviously incomplete submissions.
 */

import { useEffect, useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import {
  adminGetPaymentAttempts,
  adminConfirmAttempt,
  adminReconcileAttemptNoCollection,
  type PaymentAttempt,
} from '@/lib/attempts';
import { formatKes } from '@/lib/currency';
import { AttemptStatusBadge } from '@/components/ui/attempt-status-badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Input } from '@/components/ui/input';
import { Text } from '@/components/ui/text';

/**
 * Statuses an admin may still resolve. Mirrors the accepted set in both 0045 RPCs.
 * `timed_out` is included deliberately: it means the provider outcome is unresolved, so it needs
 * a human decision in one direction or the other — it is not a safe failure.
 */
const RESOLVABLE: PaymentAttempt['status'][] = ['initiated', 'pending', 'timed_out'];

type FormMode = 'confirm' | 'reconcile';

export default function AdminPaymentAttemptsScreen() {
  const theme = useTheme();

  const [attempts, setAttempts] = useState<PaymentAttempt[]>([]);
  const [error, setError] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);
  const [mode, setMode] = useState<FormMode>('confirm');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [reference, setReference] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    adminGetPaymentAttempts().then(setAttempts);
  }, []);

  function openForm(a: PaymentAttempt, m: FormMode) {
    setError('');
    setOpenId(a.id);
    setMode(m);
    setAmount(m === 'confirm' ? String(a.amount) : '');
    setNote('');
    setReference('');
  }

  function closeForm() {
    setOpenId(null);
    setAmount('');
    setNote('');
    setReference('');
  }

  async function submit(a: PaymentAttempt) {
    setError('');
    const trimmedNote = note.trim();
    const trimmedRef = reference.trim();

    if (!trimmedNote) {
      setError(mode === 'confirm' ? 'Confirmation note is required.' : 'Reconciliation note is required.');
      return;
    }

    setBusy(true);
    let r: { ok: boolean; error?: string };
    if (mode === 'confirm') {
      const collected = Number(amount);
      if (!Number.isFinite(collected) || collected <= 0) {
        setError('Collected amount must be a positive number.');
        setBusy(false);
        return;
      }
      // Cash has no provider-issued reference; every other provider must supply one.
      if (a.provider !== 'cash' && !trimmedRef) {
        setError('Transaction reference is required for this provider.');
        setBusy(false);
        return;
      }
      r = await adminConfirmAttempt(a.id, collected, trimmedNote, trimmedRef || null);
    } else {
      r = await adminReconcileAttemptNoCollection(a.id, trimmedNote, trimmedRef || null);
    }
    setBusy(false);

    if (r.ok) {
      closeForm();
      setAttempts(await adminGetPaymentAttempts());
    } else {
      setError(r.error ?? 'Could not update attempt.');
    }
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]}>
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
            <View style={styles.amountRow}>
              <Text variant="heading">{formatKes(a.amount)}</Text>
              <AttemptStatusBadge status={a.status} />
            </View>

            <Text variant="caption" color="textSecondary">
              {`${a.provider.toUpperCase()} · ${a.phone ?? '—'}`}
            </Text>

            <View style={[styles.metaBlock, { backgroundColor: theme.surfaceMuted }]}>
              <Text variant="caption" color="textSecondary">
                {`Ref: ${a.external_reference ?? '—'}`}
              </Text>

              {a.checkout_request_id ? (
                <Text variant="caption" color="textSecondary">{`Checkout: ${a.checkout_request_id}`}</Text>
              ) : null}
              {/* Settlement identity — distinct from the request refs above. */}
              {a.settlement_reference ? (
                <Text variant="caption" color="textSecondary">{`Settlement: ${a.settlement_reference}`}</Text>
              ) : null}
              {a.result_code != null ? (
                <Text variant="caption" color="textSecondary">{`Result: ${a.result_code} · ${a.result_desc ?? ''}`}</Text>
              ) : null}
              {a.callback_received_at ? (
                <Text variant="caption" color="textSecondary">{`Callback: ${new Date(a.callback_received_at).toLocaleString()}`}</Text>
              ) : null}
            </View>

            <Text variant="caption" color="textSecondary">
              {`#${a.payment_id.slice(0, 8)} · ${new Date(a.created_at).toLocaleDateString()}`}
            </Text>

            {RESOLVABLE.includes(a.status) && openId !== a.id ? (
              <View style={styles.actions}>
                <Button label="Confirm collected" onPress={() => openForm(a, 'confirm')} />
                <Button
                  label="Record no collection"
                  variant="ghost"
                  onPress={() => openForm(a, 'reconcile')}
                />
              </View>
            ) : null}

            {openId === a.id ? (
              <View style={styles.form}>
                {mode === 'confirm' ? (
                  <Input
                    label="Collected amount"
                    value={amount}
                    onChangeText={setAmount}
                    keyboardType="numeric"
                    helperText="Must equal the attempt amount and the payment's remaining external due."
                    testID="collected-amount"
                  />
                ) : null}

                <Input
                  label={mode === 'confirm' ? 'Confirmation note' : 'Reconciliation note'}
                  value={note}
                  onChangeText={setNote}
                  multiline
                  helperText={
                    mode === 'confirm'
                      ? 'How was this collection verified?'
                      : 'How was it verified that no money was collected?'
                  }
                  testID="resolution-note"
                />

                <Input
                  label={
                    mode === 'confirm'
                      ? a.provider === 'cash'
                        ? 'Transaction reference (optional for cash)'
                        : 'Transaction reference'
                      : 'Provider reference (optional)'
                  }
                  value={reference}
                  onChangeText={setReference}
                  autoCapitalize="characters"
                  helperText={
                    mode === 'confirm'
                      ? 'Provider receipt, e.g. the M-Pesa transaction code.'
                      : 'Provider enquiry or case reference, if any.'
                  }
                  testID="resolution-reference"
                />

                <View style={styles.actions}>
                  <Button
                    label={mode === 'confirm' ? 'Submit confirmation' : 'Submit reconciliation'}
                    onPress={() => submit(a)}
                    disabled={busy}
                  />
                  <Button label="Cancel" variant="ghost" onPress={closeForm} disabled={busy} />
                </View>
              </View>
            ) : null}
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
  form: { gap: Spacing.two, marginTop: Spacing.two },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two, marginTop: Spacing.two },
});
