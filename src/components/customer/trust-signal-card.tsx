// trust-signal-card.tsx — Row/card of trust signals derived from a provider profile.
// Accepts the output of deriveCustomerTrustSignals from @/constants/trust.
// Shows VerifiedBadge for the 'verified' signal key.
// Pure display — no side effects.

import { StyleSheet, View } from 'react-native';

import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { Card } from '@/components/ui/card';
import { Text } from '@/components/ui/text';
import { SectionHeader } from '@/components/ui/section-header';
import { VerifiedBadge } from '@/components/ui/verified-badge';
import { EmptyState } from '@/components/ui/empty-state';

// ── Props ──────────────────────────────────────────────────────────────────────

export type TrustSignalCardProps = {
  signals: { key: string; label: string; icon: string }[];
};

// ── Component ──────────────────────────────────────────────────────────────────

export function TrustSignalCard({ signals }: TrustSignalCardProps) {
  const theme = useTheme();

  if (signals.length === 0) {
    return (
      <View style={styles.container}>
        <SectionHeader title="Trust signals" />
        <EmptyState
          icon="🔍"
          title="No signals yet"
          message="This provider has not yet earned trust signals."
        />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <SectionHeader title="Trust signals" />
      <Card elevation="e1">
        <View style={styles.signalsGrid}>
          {signals.map((signal) => (
            <View key={signal.key} style={styles.signalRow}>
              {/* Icon */}
              <Text style={styles.signalIcon}>{signal.icon}</Text>

              {/* Label */}
              <Text variant="label" style={styles.signalLabel}>
                {signal.label}
              </Text>

              {/* VerifiedBadge for the 'verified' signal */}
              {signal.key === 'verified' && <VerifiedBadge />}
            </View>
          ))}
        </View>
      </Card>
    </View>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    gap: Spacing.two,
  },
  signalsGrid: {
    gap: Spacing.two,
  },
  signalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  signalIcon: {
    fontSize: 20,
    lineHeight: 24,
  },
  signalLabel: {
    flex: 1,
  },
});
