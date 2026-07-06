// review-summary-card.tsx — Reuses RatingBreakdown for a provider's aggregated ratings.
// Pure display — no side effects.

import { StyleSheet, View } from 'react-native';

import { Spacing } from '@/constants/theme';
import { type ProviderRatingBreakdown } from '@/lib/reviews';
import { Card } from '@/components/ui/card';
import { SectionHeader } from '@/components/ui/section-header';
import { RatingBreakdown } from '@/components/ui/rating-breakdown';

// ── Props ──────────────────────────────────────────────────────────────────────

export type ReviewSummaryCardProps = {
  breakdown: ProviderRatingBreakdown;
};

// ── Component ──────────────────────────────────────────────────────────────────

export function ReviewSummaryCard({ breakdown }: ReviewSummaryCardProps) {
  return (
    <View style={styles.container}>
      <SectionHeader title="Reviews" />
      <Card elevation="e1">
        <RatingBreakdown breakdown={breakdown} />
      </Card>
    </View>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    gap: Spacing.two,
  },
});
