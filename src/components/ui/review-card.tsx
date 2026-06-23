// review-card.tsx — Card that displays a single customer review with rating, comment, and date.
import { StyleSheet, View } from 'react-native';

import { Spacing } from '@/constants/theme';
import type { Review } from '@/lib/reviews';
import { Card } from '@/components/ui/card';
import { Text } from '@/components/ui/text';
import { RatingStars } from '@/components/ui/rating-stars';

export type ReviewCardProps = {
  review: Review;
};

export function ReviewCard({ review }: ReviewCardProps) {
  const date = new Date(review.created_at).toLocaleDateString();

  return (
    <Card>
      <View style={styles.content}>
        <RatingStars value={review.rating} />
        {review.comment != null && (
          <Text variant="body">{review.comment}</Text>
        )}
        <Text variant="caption" color="textSecondary">
          {date}
        </Text>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: Spacing.two,
  },
});
