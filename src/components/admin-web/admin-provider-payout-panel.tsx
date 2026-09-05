/**
 * src/components/admin-web/admin-provider-payout-panel.tsx
 *
 * Admin panel for ONE provider earning: the payout ledger, its deduction audit trail, and the
 * two admin financial actions.
 *
 * WHAT THIS SCREEN DOES NOT DO: it never transfers money. The admin pays the provider externally
 * (M-Pesa, bank, cash) and then RECORDS that transfer here as evidence. All wording is chosen to
 * keep that distinction visible — "Record payout", never "Send" or "Pay provider now".
 *
 * Figures are read from the provider_payout_ledger view. Nothing financial is recomputed in this
 * component; client-side checks exist only to give fast feedback, and the database repeats every
 * one of them.
 *
 * Both ledgers are append-only: a wrong deduction is corrected by a full reversal plus a new
 * deduction, and payouts cannot be edited or deleted. There is deliberately no UI for either.
 */

import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { SectionHeader } from '@/components/ui/section-header';
import { Text } from '@/components/ui/text';
import { Radii, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { formatKes } from '@/lib/currency';
import {
  DEDUCTION_CATEGORIES,
  PAYOUT_METHODS,
  adminRecordProviderDeduction,
  adminRecordProviderPayout,
  adminReverseProviderDeduction,
  evidenceFieldFor,
  getEarningDeductions,
  getEarningPayouts,
  adminGetPayoutLedger,
  isDeductionReversed,
  newPayoutIdempotencyKey,
  validateDeductionInput,
  validatePayoutInput,
  type DeductionCategory,
  type PayoutMethod,
  type ProviderEarningDeduction,
  type ProviderPayout,
  type ProviderPayoutLedgerRow,
} from '@/lib/earnings';

type Props = {
  earningId: string;
  /** Called after any successful mutation so the parent can refresh its own list. */
  onChanged?: () => void;
};

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <View style={styles.row}>
      <Text variant="caption" color="textSecondary">
        {label}
      </Text>
      <Text variant={strong ? 'label' : 'caption'} color="text">
        {value}
      </Text>
    </View>
  );
}

function Chip({
  label,
  selected,
  onPress,
  testID,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  testID?: string;
}) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      testID={testID}
      style={[
        styles.chip,
        { backgroundColor: selected ? theme.primary : theme.surfaceMuted },
      ]}>
      <Text variant="caption" color={selected ? 'background' : 'textSecondary'}>
        {label}
      </Text>
    </Pressable>
  );
}

export function AdminProviderPayoutPanel({ earningId, onChanged }: Props) {
  const [ledger, setLedger] = useState<ProviderPayoutLedgerRow | null>(null);
  const [deductions, setDeductions] = useState<ProviderEarningDeduction[]>([]);
  const [payouts, setPayouts] = useState<ProviderPayout[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // ── Deduction form ───────────────────────────────────────────────────────
  const [dAmount, setDAmount] = useState('');
  const [dCategory, setDCategory] = useState<DeductionCategory | ''>('');
  const [dReason, setDReason] = useState('');

  // ── Reversal ─────────────────────────────────────────────────────────────
  const [reversingId, setReversingId] = useState<string | null>(null);
  const [rReason, setRReason] = useState('');

  // ── Payout form ──────────────────────────────────────────────────────────
  const [pAmount, setPAmount] = useState('');
  const [pMethod, setPMethod] = useState<PayoutMethod | ''>('');
  const [pReference, setPReference] = useState('');
  const [pNote, setPNote] = useState('');
  const [pPaidAt, setPPaidAt] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  /**
   * IDEMPOTENCY LIFECYCLE. One key identifies one submission attempt. It is created when the
   * payout form is opened and is deliberately NOT regenerated on failure — a timeout may mean the
   * row was written, and a fresh key would record the same money twice. A new key is issued only
   * after a submission completes or the form is explicitly reset for a different payout.
   */
  const [payoutKey, setPayoutKey] = useState<string>(() => newPayoutIdempotencyKey());

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [all, ds, ps] = await Promise.all([
        adminGetPayoutLedger(),
        getEarningDeductions(earningId),
        getEarningPayouts(earningId),
      ]);
      setLedger(all.find((r) => r.earning_id === earningId) ?? null);
      setDeductions(ds);
      setPayouts(ps);
    } catch {
      setError('Could not load the payout ledger.');
    } finally {
      setLoading(false);
    }
  }, [earningId]);

  useEffect(() => {
    load();
  }, [load]);

  function resetPayoutForm() {
    setPAmount('');
    setPMethod('');
    setPReference('');
    setPNote('');
    setPPaidAt('');
    setConfirming(false);
    // A different payout is a different financial event, so it gets a different key.
    setPayoutKey(newPayoutIdempotencyKey());
  }

  async function submitDeduction() {
    if (!ledger) return;
    setError('');
    const amount = Number(dAmount);
    const check = validateDeductionInput({
      amount,
      category: dCategory,
      reason: dReason,
      entitlement: ledger.provider_entitlement,
      deductionsTotal: ledger.deductions_total,
      amountDisbursed: ledger.amount_disbursed,
    });
    if (!check.ok) {
      setError(check.error);
      return;
    }
    setSubmitting(true);
    const res = await adminRecordProviderDeduction({
      earningId,
      amount,
      category: dCategory as DeductionCategory,
      reason: dReason,
    });
    setSubmitting(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setDAmount('');
    setDCategory('');
    setDReason('');
    await load();
    onChanged?.();
  }

  async function submitReversal(deductionId: string) {
    setError('');
    if (rReason.trim() === '') {
      setError('A written reason is required to reverse a deduction.');
      return;
    }
    setSubmitting(true);
    const res = await adminReverseProviderDeduction({ deductionId, reason: rReason });
    setSubmitting(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setReversingId(null);
    setRReason('');
    await load();
    onChanged?.();
  }

  async function submitPayout() {
    if (!ledger) return;
    setError('');
    const amount = Number(pAmount);
    const check = validatePayoutInput({
      amount,
      method: pMethod,
      reference: pReference,
      note: pNote,
      outstanding: ledger.outstanding_provider_liability,
    });
    if (!check.ok) {
      setError(check.error);
      return;
    }
    setSubmitting(true);
    const res = await adminRecordProviderPayout({
      earningId,
      amount,
      method: pMethod as PayoutMethod,
      reference: pReference.trim() === '' ? null : pReference.trim(),
      note: pNote.trim() === '' ? null : pNote.trim(),
      idempotencyKey: payoutKey,
      paidAt: pPaidAt.trim() === '' ? new Date().toISOString() : pPaidAt.trim(),
    });
    setSubmitting(false);
    if (!res.ok) {
      // Key intentionally retained: retrying this same submission must not create a second record.
      setError(res.error);
      return;
    }
    resetPayoutForm();
    await load();
    onChanged?.();
  }

  if (loading) {
    return (
      <Text variant="caption" color="textSecondary">
        Loading payout ledger…
      </Text>
    );
  }
  if (!ledger) {
    return (
      <Text variant="caption" color="error">
        {error || 'Payout ledger not available for this earning.'}
      </Text>
    );
  }

  const outstanding = ledger.outstanding_provider_liability;
  const canRecordPayout = outstanding > 0;
  const evidence = pMethod ? evidenceFieldFor(pMethod) : null;

  return (
    <View style={styles.container} testID="admin-provider-payout-panel">
      {error ? (
        <Text variant="caption" color="error" testID="payout-panel-error">
          {error}
        </Text>
      ) : null}

      {/* ── Ledger figures — authoritative, straight from the view ── */}
      <Card style={styles.card}>
        <SectionHeader title="Provider payout ledger" />
        <Row label="Provider entitlement" value={formatKes(ledger.provider_entitlement)} />
        <Row label="Deductions" value={formatKes(ledger.deductions_total)} />
        <Row label="Net provider payable" value={formatKes(ledger.net_provider_payable)} strong />
        <Row label="Already disbursed" value={formatKes(ledger.amount_disbursed)} />
        <Row label="Outstanding" value={formatKes(outstanding)} strong />
        <Row label="Payout status" value={ledger.stored_payout_status} />
        {!canRecordPayout ? (
          <Text variant="caption" color="textSecondary" testID="nothing-outstanding">
            Nothing outstanding — no payout to record.
          </Text>
        ) : null}
      </Card>

      {/* ── Deductions ── */}
      <Card style={styles.card}>
        <SectionHeader title="Deductions" />
        {deductions.length === 0 ? (
          <Text variant="caption" color="textSecondary">
            No deductions recorded.
          </Text>
        ) : (
          deductions.map((d) => {
            const reversed = isDeductionReversed(d, deductions);
            const isReversal = d.reversal_of !== null;
            return (
              <View key={d.id} style={styles.listRow}>
                <Text variant="caption" color={isReversal ? 'success' : 'text'}>
                  {`${isReversal ? 'DEDUCTION REVERSAL' : 'DEDUCTION'} · ${formatKes(d.amount)} · ${d.category}`}
                </Text>
                <Text variant="caption" color="textSecondary">
                  {d.reason}
                </Text>
                {!isReversal && !reversed ? (
                  reversingId === d.id ? (
                    <View style={styles.inlineForm}>
                      <Input
                        label="Reason for reversal"
                        value={rReason}
                        onChangeText={setRReason}
                        placeholder="Why is this deduction being reversed?"
                        testID="reversal-reason"
                      />
                      <Button
                        label="Confirm reversal"
                        onPress={() => submitReversal(d.id)}
                        disabled={submitting}
                      />
                      <Button
                        label="Cancel"
                        variant="ghost"
                        onPress={() => {
                          setReversingId(null);
                          setRReason('');
                        }}
                      />
                    </View>
                  ) : (
                    <Button
                      label="Reverse deduction"
                      variant="ghost"
                      onPress={() => setReversingId(d.id)}
                    />
                  )
                ) : null}
                {reversed ? (
                  <Text variant="caption" color="textSecondary">
                    Reversed
                  </Text>
                ) : null}
              </View>
            );
          })
        )}

        <SectionHeader title="Record a deduction" />
        <Input
          label="Amount (KES)"
          value={dAmount}
          onChangeText={setDAmount}
          keyboardType="numeric"
          placeholder="0"
          testID="deduction-amount"
        />
        <View style={styles.chips}>
          {DEDUCTION_CATEGORIES.map((c) => (
            <Chip
              key={c.value}
              label={c.label}
              selected={dCategory === c.value}
              onPress={() => setDCategory(c.value)}
              testID={`deduction-category-${c.value}`}
            />
          ))}
        </View>
        <Input
          label="Reason (required)"
          value={dReason}
          onChangeText={setDReason}
          placeholder="Why is this being deducted?"
          testID="deduction-reason"
        />
        <Button label="Record deduction" onPress={submitDeduction} disabled={submitting} />
      </Card>

      {/* ── Payout history — immutable evidence ── */}
      <Card style={styles.card}>
        <SectionHeader title="Payouts recorded" />
        {payouts.length === 0 ? (
          <Text variant="caption" color="textSecondary">
            No payouts recorded.
          </Text>
        ) : (
          payouts.map((p) => (
            <View key={p.id} style={styles.listRow}>
              <Text variant="caption" color="text">
                {`${formatKes(p.amount)} · ${p.method}`}
              </Text>
              <Text variant="caption" color="textSecondary">
                {`${p.reference ?? p.note ?? ''} · paid ${new Date(p.paid_at).toLocaleDateString()}`}
              </Text>
            </View>
          ))
        )}
      </Card>

      {/* ── Record a payout ── */}
      {canRecordPayout ? (
        <Card style={styles.card}>
          <SectionHeader title="Record a payout already made" />
          <Text variant="caption" color="textSecondary">
            Recording does not transfer money. Pay the provider externally first, then record the
            transfer here.
          </Text>

          {!confirming ? (
            <>
              <Input
                label="Amount (KES)"
                value={pAmount}
                onChangeText={setPAmount}
                keyboardType="numeric"
                placeholder="0"
                testID="payout-amount"
              />
              <View style={styles.chips}>
                {PAYOUT_METHODS.map((m) => (
                  <Chip
                    key={m.value}
                    label={m.label}
                    selected={pMethod === m.value}
                    onPress={() => setPMethod(m.value)}
                    testID={`payout-method-${m.value}`}
                  />
                ))}
              </View>
              {evidence === 'reference' ? (
                <Input
                  label="Transaction reference (required)"
                  value={pReference}
                  onChangeText={setPReference}
                  placeholder="e.g. M-Pesa code"
                  testID="payout-reference"
                />
              ) : null}
              {evidence === 'note' ? (
                <Input
                  label="Note (required)"
                  value={pNote}
                  onChangeText={setPNote}
                  placeholder="Describe how the provider was paid"
                  testID="payout-note"
                />
              ) : null}
              <Input
                label="Paid at (ISO date, blank = now)"
                value={pPaidAt}
                onChangeText={setPPaidAt}
                placeholder="2026-08-30T12:00:00Z"
                testID="payout-paid-at"
              />
              <Button
                label="Review payout"
                onPress={() => setConfirming(true)}
                testID="payout-review"
              />
            </>
          ) : (
            <View testID="payout-confirmation">
              <SectionHeader title="Confirm this financial event" />
              <Row label="Provider" value={`#${ledger.provider_id.slice(0, 8)}`} />
              <Row label="Booking" value={`#${ledger.booking_id.slice(0, 8)}`} />
              <Row label="Provider entitlement" value={formatKes(ledger.provider_entitlement)} />
              <Row label="Deductions" value={formatKes(ledger.deductions_total)} />
              <Row label="Net payable" value={formatKes(ledger.net_provider_payable)} />
              <Row label="Already disbursed" value={formatKes(ledger.amount_disbursed)} />
              <Row label="Outstanding" value={formatKes(outstanding)} />
              <Row label="Payout amount" value={formatKes(Number(pAmount) || 0)} strong />
              <Row label="Method" value={pMethod || '—'} />
              <Row
                label={evidence === 'reference' ? 'Reference' : 'Note'}
                value={(evidence === 'reference' ? pReference : pNote) || '—'}
              />
              <Row label="Paid at" value={pPaidAt || 'now'} />
              <Button
                label="Record payout"
                onPress={submitPayout}
                disabled={submitting}
                testID="payout-submit"
              />
              <Button label="Back" variant="ghost" onPress={() => setConfirming(false)} />
            </View>
          )}
        </Card>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: Spacing.three, alignSelf: 'stretch' },
  card: { gap: Spacing.two },
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: Spacing.two },
  listRow: { gap: Spacing.one, paddingVertical: Spacing.one },
  inlineForm: { gap: Spacing.two },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  chip: {
    borderRadius: Radii.pill,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.one,
  },
});
