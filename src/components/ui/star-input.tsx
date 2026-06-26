// star-input.tsx — Interactive 5-star picker that lets the user tap a star to set a rating.
import { Pressable, StyleSheet, View } from 'react-native';

import { Spacing, Typography } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { Text } from '@/components/ui/text';

export type StarInputProps = {
  /** Current rating value (0 means nothing selected yet). */
  value: number;
  /** Called with the new rating when the user taps a star. */
  onChange: (n: number) => void;
};

// Minimum 44×44 touch target for each star, achieved via hitSlop.
// The star emoji renders at ~24 px (title fontSize); we add 10 px padding on each
// side so the tap area meets the 44 px accessibility guideline.
const STAR_HIT_SLOP = { top: 10, right: 10, bottom: 10, left: 10 } as const;

export function StarInput({ value, onChange }: StarInputProps) {
  const theme = useTheme();

  return (
    <View style={styles.row}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Pressable
          key={n}
          testID={`star-${n}`}
          onPress={() => onChange(n)}
          hitSlop={STAR_HIT_SLOP}
          accessibilityRole="button"
          accessibilityLabel={`Rate ${n} star${n === 1 ? '' : 's'}`}>
          <Text
            style={[styles.star, { color: n <= value ? theme.warning : theme.border }]}>
            {n <= value ? '★' : '☆'}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  star: {
    fontSize: Typography.title.fontSize,
    lineHeight: Typography.title.lineHeight,
  },
});
