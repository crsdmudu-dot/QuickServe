/**
 * Trust & Safety screen (Slice 34 Task 5 — pushed route).
 *
 * Sections:
 *   1. Verified provider explanation — what the verified badge means (static copy + VerifiedBadge).
 *   2. TrustSignalCard — representative trust signals for illustration (derived/static).
 *   3. ServiceGuaranteesCard — KwikServe's platform guarantees.
 *   4. SafetyTipsCard — SAFETY_REMINDERS + CUSTOMER_TIPS.
 *
 * Fully static/derived content — no data mutation.
 */

import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';

import { deriveCustomerTrustSignals } from '@/constants/trust';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { SectionHeader } from '@/components/ui/section-header';
import { Text } from '@/components/ui/text';
import { VerifiedBadge } from '@/components/ui/verified-badge';
import { TrustSignalCard } from '@/components/customer/trust-signal-card';
import { ServiceGuaranteesCard } from '@/components/customer/service-guarantees-card';
import { SafetyTipsCard } from '@/components/customer/safety-tips-card';

// ── Illustrative trust signals — representative example (fully static, no DB call) ────────────

const ILLUSTRATIVE_SIGNALS = deriveCustomerTrustSignals({
  is_verified: true,
  completed_jobs_count: 120,
  average_rating: 4.9,
});

// ── Component ──────────────────────────────────────────────────────────────────

export default function TrustScreen() {
  const theme = useTheme();

  return (
    <ScrollView
      style={{ backgroundColor: theme.background }}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <SafeAreaView style={[styles.safe, { maxWidth: MaxContentWidth }]}>
        <Button label="← Back" variant="ghost" onPress={() => router.back()} />
        {/* ── Header ──────────────────────────────────────────────────── */}
        <Text variant="title">Trust &amp; Safety</Text>
        <Text variant="body" color="textSecondary">
          How KwikServe keeps you safe and your bookings reliable.
        </Text>

        {/* ── 1. Verified provider explanation ────────────────────────── */}
        <View style={styles.section}>
          <SectionHeader title="Verified providers" />
          <Card elevation="e1">
            <View style={styles.verifiedBlock}>
              <VerifiedBadge />
              <Text variant="body" color="textSecondary" style={styles.verifiedBody}>
                Providers earn the{' '}
                <Text variant="body" weight="semibold">
                  Verified by KwikServe
                </Text>{' '}
                badge after passing our background check, identity verification, and skills
                assessment. Look for this badge when choosing a provider for extra confidence.
              </Text>
            </View>
          </Card>
        </View>

        {/* ── 2. Trust signal illustration ────────────────────────────── */}
        <TrustSignalCard signals={ILLUSTRATIVE_SIGNALS} />

        {/* ── 3. Service guarantees ────────────────────────────────────── */}
        <ServiceGuaranteesCard />

        {/* ── 4. Safety tips ───────────────────────────────────────────── */}
        <SafetyTipsCard />
      </SafeAreaView>
    </ScrollView>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  content: {
    alignItems: 'center',
    paddingBottom: Spacing.six,
  },
  safe: {
    width: '100%',
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.four,
    gap: Spacing.five,
  },
  section: {
    gap: Spacing.two,
  },
  verifiedBlock: {
    gap: Spacing.three,
  },
  verifiedBody: {
    lineHeight: 22,
  },
});
