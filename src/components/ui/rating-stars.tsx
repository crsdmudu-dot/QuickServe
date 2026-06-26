// rating-stars.tsx — Displays a read-only row of 5 stars representing a rating value.
import { StyleSheet, View } from 'react-native';

import { Spacing, Typography } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { Text } from '@/components/ui/text';

export type RatingStarsProps = {
  /** The numeric rating (1–5). Pass null to show "Not yet rated". */
  value: number | null;
  /** When provided, appends a count label like "(12)". */
  count?: number;
};

export function RatingStars({ value, count }: RatingStarsProps) {
  const theme = useTheme();

  if (value == null) {
    return (
      <Text variant="caption" color="textSecondary">
        Not yet rated
      </Text>
    );
  }

  const filled = Math.round(value);

  return (
    <View style={styles.row}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Text
          key={n}
          style={[styles.star, { color: n <= filled ? theme.warning : theme.border }]}>
          {n <= filled ? '★' : '☆'}
        </Text>
      ))}
      {count != null && (
        <Text variant="caption" color="textSecondary" style={styles.count}>
          ({count})
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
  },
  star: {
    fontSize: Typography.body.fontSize,
    lineHeight: Typography.body.lineHeight,
  },
  count: {
    marginLeft: Spacing.two,
  },
});
