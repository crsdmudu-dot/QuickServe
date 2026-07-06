// provider-quality-breakdown-card.tsx — Provider quality rating breakdown card.
// Shows overall rating, review count, would-recommend %, and the 5 category rows.
// Reuses the RatingBreakdown primitive internally.
// NO import of @/lib/operations or any private admin tables.

import { StyleSheet, View } from 'react-native';

import { Spacing } from '@/constants/theme';
import { Card } from '@/components/ui/card';
import { RatingBreakdown } from '@/components/ui/rating-breakdown';
import { Text } from '@/components/ui/text';
import type { ProviderRatingBreakdown } from '@/lib/reviews';

export type ProviderQualityBreakdownCardProps = {
  breakdown: ProviderRatingBreakdown;
};

export function ProviderQualityBreakdownCard({
  breakdown,
}: ProviderQualityBreakdownCardProps) {
  return (
    <Card>
      <View style={styles.container}>
        {/* Section title */}
        <Text variant="label" weight="semibold">
          Your ratings
        </Text>

        {/* Reuse the RatingBreakdown primitive — handles empty state, bars, stars */}
        <RatingBreakdown breakdown={breakdown} />
      </View>
    </Card>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    gap: Spacing.two,
  },
});
