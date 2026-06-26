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

export function StarInput({ value, onChange }: StarInputProps) {
  const theme = useTheme();

  return (
    <View style={styles.row}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Pressable key={n} testID={`star-${n}`} onPress={() => onChange(n)}>
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
