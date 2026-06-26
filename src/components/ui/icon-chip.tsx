import { StyleSheet, Text, View } from 'react-native';

import { Radii, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export type IconChipProps = {
  /** Emoji glyph. */
  icon: string;
  size?: number;
  /** Background variant: 'primary' uses primarySurface tint, 'muted' uses surfaceMuted. Defaults to 'primary'. */
  variant?: 'primary' | 'muted';
};

export function IconChip({ icon, size = 28, variant = 'primary' }: IconChipProps) {
  const theme = useTheme();
  const backgroundColor =
    variant === 'muted' ? theme.surfaceMuted : theme.primarySurface;

  return (
    <View style={[styles.chip, { backgroundColor }]}>
      <Text style={{ fontSize: size }}>{icon}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    width: 56,
    height: 56,
    borderRadius: Radii.lg,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.two,
  },
});
