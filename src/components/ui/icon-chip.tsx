import { StyleSheet, Text, View } from 'react-native';

import { Radii, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export type IconChipProps = {
  /** Emoji glyph. */
  icon: string;
  size?: number;
};

export function IconChip({ icon, size = 28 }: IconChipProps) {
  const theme = useTheme();
  return (
    <View style={[styles.chip, { backgroundColor: theme.primaryTint }]}>
      <Text style={{ fontSize: size }}>{icon}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    width: 56,
    height: 56,
    borderRadius: Radii.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.two,
  },
});
