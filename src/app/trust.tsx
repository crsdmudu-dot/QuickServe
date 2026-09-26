/**
 * Trust & Safety screen (Slice 34 Task 5 — pushed route).
 *
 * Sections:
 *   1. Verified provider explanation — what the verified badge means (static copy + VerifiedBadge).
 *   2. ServiceGuaranteesCard — KwikServe's platform guarantees.
 *   3. SafetyTipsCard — SAFETY_REMINDERS + CUSTOMER_TIPS.
 *
 * Every statement here must be true today (App Store 2.3.1: no misleading claims). The owner
 * confirmed on 2026-09-26 that providers are reviewed and approved by the team; background checks,
 * ID checks and skills assessments are NOT claimed. The former sample card with invented figures
 * (120 jobs, 4.9 stars) was removed.
 *
 * Fully static content — no data mutation.
 */

import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';

import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { SectionHeader } from '@/components/ui/section-header';
import { Text } from '@/components/ui/text';
import { VerifiedBadge } from '@/components/ui/verified-badge';
import { ServiceGuaranteesCard } from '@/components/customer/service-guarantees-card';
import { SafetyTipsCard } from '@/components/customer/safety-tips-card';

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
                Every provider on KwikServe is reviewed and approved by our team before they can
                take jobs. The{' '}
                <Text variant="body" weight="semibold">
                  Verified by KwikServe
                </Text>{' '}
                badge is added by our team after it reviews a provider.
              </Text>
            </View>
          </Card>
        </View>

        {/* ── 2. Service guarantees ────────────────────────────────────── */}
        <ServiceGuaranteesCard />

        {/* ── 3. Safety tips ───────────────────────────────────────────── */}
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
