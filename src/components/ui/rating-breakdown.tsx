// rating-breakdown.tsx — Displays an aggregated provider rating breakdown.
// Shows overall stars, would-recommend %, category bars, and positive strength tags.
// Pure display component — no sorting/ranking, no side effects.
import { StyleSheet, View } from 'react-native';

import { Radii, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { type ProviderRatingBreakdown, REVIEW_TAGS } from '@/lib/reviews';
import { Text } from '@/components/ui/text';
import { RatingStars } from '@/components/ui/rating-stars';

export type RatingBreakdownProps = {
  /** The aggregated rating breakdown for a provider. */
  breakdown: ProviderRatingBreakdown;
};

// ── Category config ────────────────────────────────────────────────────────────

/** Maps each category label to its key in the breakdown object. */
const CATEGORIES: { label: string; key: keyof ProviderRatingBreakdown }[] = [
  { label: 'Quality',          key: 'quality_avg' },
  { label: 'Punctuality',      key: 'punctuality_avg' },
  { label: 'Communication',    key: 'communication_avg' },
  { label: 'Professionalism',  key: 'professionalism_avg' },
  { label: 'Value',            key: 'value_avg' },
];

// ── Component ─────────────────────────────────────────────────────────────────

export function RatingBreakdown({ breakdown }: RatingBreakdownProps) {
  const theme = useTheme();

  // ── Empty state ──────────────────────────────────────────────────────────────
  if (breakdown.review_count === 0) {
    return (
      <Text variant="caption" color="textSecondary">
        No reviews yet.
      </Text>
    );
  }

  // ── Filter positive top-tags ─────────────────────────────────────────────────
  // Only show tags that exist in REVIEW_TAGS and have positive sentiment.
  const positiveChips = breakdown.top_tags
    .map((key) => REVIEW_TAGS.find((t) => t.key === key))
    .filter((t) => t !== undefined && t.sentiment === 'positive') as typeof REVIEW_TAGS;

  return (
    <View style={styles.container}>
      {/* ── Overall stars ── */}
      <RatingStars value={breakdown.overall_avg} count={breakdown.review_count} />

      {/* ── Would recommend ── */}
      {breakdown.recommend_pct != null && (
        <Text variant="caption" color="textSecondary">
          {'👍 '}
          {Math.round(breakdown.recommend_pct)}% would recommend
        </Text>
      )}

      {/* ── Category bars ── */}
      <View style={styles.categorySection}>
        {CATEGORIES.map(({ label, key }) => {
          const avg = breakdown[key] as number | null;
          if (avg == null) return null;
          const fillPct = (avg / 5) * 100;
          return (
            <View key={key} style={styles.categoryRow}>
              {/* Label */}
              <Text variant="caption" style={styles.categoryLabel}>
                {label}
              </Text>
              {/* Bar track + fill */}
              <View
                style={[styles.barTrack, { backgroundColor: theme.backgroundElement }]}>
                <View
                  style={[
                    styles.barFill,
                    {
                      backgroundColor: theme.primary,
                      width: `${fillPct}%` as any,
                    },
                  ]}
                />
              </View>
              {/* Numeric average */}
              <Text variant="caption" color="textSecondary" style={styles.avgText}>
                {avg.toFixed(1)}
              </Text>
            </View>
          );
        })}
      </View>

      {/* ── Strength tags (positive only) ── */}
      {positiveChips.length > 0 && (
        <View style={styles.tagsSection}>
          <Text variant="caption" weight="medium" color="textSecondary">
            Strengths
          </Text>
          <View style={styles.tagsRow}>
            {positiveChips.map((tag) => (
              <View
                key={tag.key}
                style={[styles.chip, { backgroundColor: theme.primaryTint }]}>
                <Text variant="caption" color="primary">
                  {tag.label}
                </Text>
              </View>
            ))}
          </View>
        </View>
      )}
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    gap: Spacing.two,
  },
  categorySection: {
    gap: Spacing.one,
  },
  categoryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  categoryLabel: {
    width: 110,
  },
  barTrack: {
    flex: 1,
    height: 6,
    borderRadius: Radii.pill,
    overflow: 'hidden',
  },
  barFill: {
    height: 6,
    borderRadius: Radii.pill,
  },
  avgText: {
    width: 28,
    textAlign: 'right',
  },
  tagsSection: {
    gap: Spacing.one,
  },
  tagsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.one,
  },
  chip: {
    borderRadius: Radii.pill,
    paddingHorizontal: Spacing.two,
    paddingVertical: 2,
  },
});
