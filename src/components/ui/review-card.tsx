// review-card.tsx — Card that displays a single customer review with rating, comment, and date.
// Enriched with Ratings v2 fields: category ratings, would-recommend, and tag chips.
// LEGACY FALLBACK: when all v2 fields are absent the card renders exactly as before
// (stars + comment + date only), so existing tests remain green.
import { StyleSheet, View } from 'react-native';

import { Radii, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { Review } from '@/lib/reviews';
import { REVIEW_TAGS } from '@/lib/reviews';
import { Card } from '@/components/ui/card';
import { Text } from '@/components/ui/text';
import { RatingStars } from '@/components/ui/rating-stars';

export type ReviewCardProps = {
  review: Review;
};

// ── Category config ───────────────────────────────────────────────────────────

/** Maps each category label to its key in the Review object. */
const CATEGORIES: { label: string; key: keyof Review }[] = [
  { label: 'Quality',         key: 'quality_rating' },
  { label: 'Punctuality',     key: 'punctuality_rating' },
  { label: 'Communication',   key: 'communication_rating' },
  { label: 'Professionalism', key: 'professionalism_rating' },
  { label: 'Value',           key: 'value_rating' },
];

// ── Component ─────────────────────────────────────────────────────────────────

export function ReviewCard({ review }: ReviewCardProps) {
  const theme = useTheme();
  const date = new Date(review.created_at).toLocaleDateString();

  // Determine whether any v2 category field is present
  const hasCategories = CATEGORIES.some((c) => review[c.key] != null);

  // Resolve tag labels: look up in REVIEW_TAGS, fall back to the raw key
  const tagChips: string[] = (review.tags ?? []).map((key) => {
    const found = REVIEW_TAGS.find((t) => t.key === key);
    return found ? found.label : key;
  });

  return (
    <Card elevation="e1">
      <View style={styles.content}>
        {/* ── Overall stars (always shown) ── */}
        <RatingStars value={review.rating} />

        {/* ── Category ratings (v2 — only when at least one is non-null) ── */}
        {hasCategories && (
          <View style={styles.categoryBlock}>
            {CATEGORIES.map(({ label, key }) => {
              const val = review[key] as number | null;
              if (val == null) return null;
              return (
                <Text key={key} variant="caption" color="textSecondary">
                  {label} {val}/5
                </Text>
              );
            })}
          </View>
        )}

        {/* ── Comment (always shown when present) ── */}
        {review.comment != null && (
          <Text variant="body">{review.comment}</Text>
        )}

        {/* ── Would-recommend indicator (v2) ── */}
        {review.would_recommend != null && (
          <Text variant="caption" color="textSecondary">
            {review.would_recommend ? '👍 Would recommend' : '👎 Would not recommend'}
          </Text>
        )}

        {/* ── Tag chips (v2) ── */}
        {tagChips.length > 0 && (
          <View style={styles.tagsRow}>
            {tagChips.map((label, i) => (
              <View
                key={i}
                style={[styles.chip, { backgroundColor: theme.primaryTint }]}>
                <Text variant="caption" color="primary">
                  {label}
                </Text>
              </View>
            ))}
          </View>
        )}

        {/* ── Date (always shown) ── */}
        <Text variant="caption" color="textSecondary">
          {date}
        </Text>
      </View>
    </Card>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  content: {
    gap: Spacing.two,
  },
  categoryBlock: {
    gap: 2,
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
