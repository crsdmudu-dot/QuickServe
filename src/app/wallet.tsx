/**
 * wallet.tsx — Customer wallet screen (read-only).
 *
 * A pushable Stack screen (URL /wallet) reachable from the customer profile.
 * Shows the available balance and a list of recent wallet transactions.
 * No mutation controls — purely informational.
 *
 * Mirrors the pattern used in saved-addresses.tsx.
 */

import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { Text } from '@/components/ui/text';
import { WalletTransactionRow } from '@/components/ui/wallet-transaction-row';
import { formatKes } from '@/lib/currency';
import { getMyWallet, getMyWalletTransactions, type Wallet, type WalletTransaction } from '@/lib/wallet';

// ── Component ──────────────────────────────────────────────────────────────────

export default function WalletScreen() {
  const theme = useTheme();

  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [txns, setTxns] = useState<WalletTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Load wallet and transactions in parallel on mount.
  useEffect(() => {
    let mounted = true;
    setLoading(true);

    Promise.all([getMyWallet(), getMyWalletTransactions()])
      .then(([w, t]) => {
        if (mounted) {
          setWallet(w);
          setTxns(t);
        }
      })
      .catch(() => {
        if (mounted) {
          setError('Could not load your wallet.');
        }
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, []);

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Back button ─────────────────────────────────────────────────── */}
        <Button label="← Back" variant="ghost" onPress={() => router.back()} />

        {/* ── Screen title ────────────────────────────────────────────────── */}
        <Text variant="title" style={styles.title}>
          Wallet
        </Text>

        {/* ── Available balance header ─────────────────────────────────────── */}
        <View style={[styles.balanceCard, { backgroundColor: theme.primarySurface }]}>
          <Text variant="caption" color="textSecondary">
            Available balance
          </Text>
          <Text variant="display" color="primary" weight="bold">
            {formatKes(wallet?.balance ?? 0)}
          </Text>
        </View>

        {/* ── Error caption ───────────────────────────────────────────────── */}
        {error ? (
          <Text variant="caption" color="error">
            {error}
          </Text>
        ) : null}

        {/* ── Loading skeletons ────────────────────────────────────────────── */}
        {loading && (
          <View style={styles.skeletons}>
            <Skeleton height={72} />
            <Skeleton height={72} />
            <Skeleton height={72} />
          </View>
        )}

        {/* ── Recent activity ──────────────────────────────────────────────── */}
        {!loading && (
          <View style={styles.section}>
            <Text variant="heading" weight="semibold">
              Recent activity
            </Text>

            {txns.length === 0 ? (
              <EmptyState
                icon="💳"
                title="No wallet activity yet"
                message="Credits and applied payments will show up here."
              />
            ) : (
              <View style={styles.list}>
                {txns.map((txn) => (
                  <WalletTransactionRow key={txn.id} txn={txn} />
                ))}
              </View>
            )}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safe: { flex: 1 },
  scroll: {
    flexGrow: 1,
    padding: Spacing.four,
    gap: Spacing.three,
  },
  title: {
    marginBottom: Spacing.one,
  },
  balanceCard: {
    borderRadius: 16,
    padding: Spacing.four,
    alignItems: 'center',
    gap: Spacing.one,
    marginBottom: Spacing.two,
  },
  skeletons: {
    gap: Spacing.three,
  },
  section: {
    gap: Spacing.three,
  },
  list: {
    gap: Spacing.two,
  },
});
