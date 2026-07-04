/**
 * src/components/admin-web/admin-wallet-panel.tsx
 *
 * Displays a customer's wallet balance and transaction history,
 * and provides an audited adjustment form for admin use.
 *
 * Props:
 *   customerId — the customer whose wallet to display and adjust.
 *
 * Design:
 *   - Balance shown at the top via formatKes.
 *   - Transaction history: type label, signed+colored amount, date, note,
 *     created_by id slice (audit actor), payment_id ref when present.
 *   - Adjustment form: type chip selector (7 admin types), amount input,
 *     required note input, direction hint, "Apply adjustment" button.
 *   - Sign derived from WALLET_TXN_TYPES[type].direction — debit → negative.
 *   - Overdraw is enforced server-side (admin_wallet_adjust RPC).
 */

import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Radii, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { usePaginatedList } from '@/hooks/use-paginated-list';
import {
  adminGetWallet,
  adminGetWalletTransactions,
  adminAdjustWallet,
  WALLET_TXN_TYPES,
  type Wallet,
  type WalletTxnType,
} from '@/lib/wallet';
import { formatKes } from '@/lib/currency';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { LoadMoreButton } from '@/components/ui/load-more-button';
import { SectionHeader } from '@/components/ui/section-header';
import { Text } from '@/components/ui/text';

// ── The 7 admin-adjustable transaction types ───────────────────────────────

const ADMIN_TXN_TYPES: WalletTxnType[] = [
  'admin_credit',
  'admin_debit',
  'refund_credit',
  'promo_credit',
  'referral_credit',
  'gift_credit',
  'adjustment',
];

// ── Props ──────────────────────────────────────────────────────────────────

export type AdminWalletPanelProps = {
  /** The customer whose wallet to read and adjust. */
  customerId: string;
};

// ── Component ──────────────────────────────────────────────────────────────

export function AdminWalletPanel({ customerId }: AdminWalletPanelProps) {
  const theme = useTheme();

  // ── Wallet balance state ─────────────────────────────────────────────────
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [walletLoading, setWalletLoading] = useState(true);

  // ── Transactions via paginated list ──────────────────────────────────────
  const {
    items: txns,
    loading: txnsLoading,
    hasMore: txnsHasMore,
    loadMore: loadMoreTxns,
    reload: reloadTxns,
  } = usePaginatedList((p, s) => adminGetWalletTransactions(customerId, p, s));

  const loading = walletLoading || txnsLoading;

  // ── Adjustment form state ────────────────────────────────────────────────
  const [type, setType] = useState<WalletTxnType>('admin_credit');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  // ── Load wallet balance ──────────────────────────────────────────────────
  const loadWallet = useCallback(async () => {
    setWalletLoading(true);
    const w = await adminGetWallet(customerId);
    setWallet(w);
    setWalletLoading(false);
  }, [customerId]);

  useEffect(() => {
    loadWallet();
  }, [loadWallet]);

  // ── Derived direction + signed amount preview ────────────────────────────
  const direction = WALLET_TXN_TYPES[type].direction;
  const amountNum = Number(amount);
  const signedAmount =
    direction === 'debit' ? -Math.abs(amountNum) : Math.abs(amountNum);
  const canSubmit = amountNum > 0 && note.trim() !== '';

  // ── Submit handler ────────────────────────────────────────────────────────
  async function handleApply() {
    if (!canSubmit) return;
    setSubmitting(true);
    setError('');
    const res = await adminAdjustWallet(customerId, type, signedAmount, note.trim());
    if (res.ok) {
      // Clear form and reload wallet + transactions
      setAmount('');
      setNote('');
      await loadWallet();
      reloadTxns();
    } else {
      setError(res.error ?? 'Could not adjust wallet.');
    }
    setSubmitting(false);
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <View style={styles.container}>
      <SectionHeader title="Customer wallet" />

      {/* Balance */}
      <Card>
        <View style={styles.balanceRow}>
          <Text variant="label" color="textSecondary">
            Balance
          </Text>
          <Text variant="heading" weight="semibold">
            {formatKes(wallet?.balance ?? 0)}
          </Text>
        </View>
      </Card>

      {/* Transaction history */}
      <SectionHeader title="Transaction history" />
      {txnsLoading && txns.length === 0 ? (
        <Text variant="caption" color="textSecondary">
          Loading…
        </Text>
      ) : txns.length === 0 ? (
        <Text variant="caption" color="textSecondary">
          No wallet activity.
        </Text>
      ) : (
        txns.map((t) => {
          const meta = WALLET_TXN_TYPES[t.type];
          const isPositive = t.amount >= 0;
          const amountLabel =
            (isPositive ? '+' : '−') + formatKes(Math.abs(t.amount));
          const createdBySlice = t.created_by
            ? `#${t.created_by.slice(0, 8)}`
            : '—';
          return (
            <Card key={t.id} style={styles.txnCard}>
              <View style={styles.txnRow}>
                {/* Type label + amount */}
                <View style={styles.txnLeft}>
                  <Text variant="label" weight="medium">
                    {meta.label}
                  </Text>
                  <Text
                    variant="caption"
                    color={isPositive ? 'success' : 'error'}>
                    {amountLabel}
                  </Text>
                </View>

                {/* Date */}
                <Text variant="caption" color="textTertiary">
                  {new Date(t.created_at).toLocaleDateString()}
                </Text>
              </View>

              {/* Note */}
              {t.note ? (
                <Text variant="caption" color="textSecondary" style={styles.txnNote}>
                  {t.note}
                </Text>
              ) : null}

              {/* Audit: created_by + payment ref */}
              <View style={styles.txnAudit}>
                <Text variant="caption" color="textTertiary">
                  {`Actor ${createdBySlice}`}
                </Text>
                {t.payment_id ? (
                  <Text variant="caption" color="textTertiary">
                    {`Ref #${t.payment_id.slice(0, 8)}`}
                  </Text>
                ) : null}
              </View>
            </Card>
          );
        })
      )}
      <LoadMoreButton onPress={loadMoreTxns} loading={txnsLoading} hasMore={txnsHasMore} />

      {/* Adjustment form */}
      <SectionHeader title="Apply adjustment" />

      {/* Type chips */}
      <View style={styles.chipRow}>
        {ADMIN_TXN_TYPES.map((t) => {
          const selected = t === type;
          return (
            <Pressable
              key={t}
              onPress={() => setType(t)}
              accessibilityRole="button"
              accessibilityLabel={WALLET_TXN_TYPES[t].label}
              style={[
                styles.chip,
                {
                  backgroundColor: selected ? theme.primary : theme.surface,
                  borderColor: selected ? theme.primary : theme.border,
                },
              ]}>
              <Text
                variant="caption"
                color={selected ? 'background' : 'textSecondary'}>
                {WALLET_TXN_TYPES[t].label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {/* Direction hint */}
      <Text variant="caption" color={direction === 'debit' ? 'error' : 'success'}>
        {direction === 'debit'
          ? 'This will DEBIT the wallet (reduce balance).'
          : 'This will CREDIT the wallet (increase balance).'}
      </Text>

      {/* Amount */}
      <Input
        label="Amount (KES)"
        value={amount}
        onChangeText={setAmount}
        placeholder="e.g. 500"
        keyboardType="numeric"
      />

      {/* Note (required) */}
      <Input
        label="Note / reason (required)"
        value={note}
        onChangeText={setNote}
        placeholder="Reason for this adjustment…"
      />

      {/* Error */}
      {error ? (
        <Text variant="caption" color="error">
          {error}
        </Text>
      ) : null}

      {/* Submit */}
      <Button
        label="Apply adjustment"
        onPress={handleApply}
        disabled={!canSubmit}
        loading={submitting}
      />
    </View>
  );
}

// ── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    gap: Spacing.three,
  },
  balanceRow: {
    gap: Spacing.one,
  },
  txnCard: {
    gap: Spacing.one,
  },
  txnRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  txnLeft: {
    gap: Spacing.one,
    flex: 1,
  },
  txnNote: {
    marginTop: Spacing.one,
  },
  txnAudit: {
    flexDirection: 'row',
    gap: Spacing.two,
    marginTop: Spacing.one,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  chip: {
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.one,
    borderRadius: Radii.pill,
    borderWidth: 1,
  },
});
