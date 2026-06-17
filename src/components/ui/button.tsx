import { Pressable, StyleSheet, type ViewStyle } from 'react-native';

import { Radii, Spacing, type ThemeColor } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { Text } from '@/components/ui/text';

export type ButtonProps = {
  label: string;
  onPress?: () => void;
  variant?: 'primary' | 'secondary' | 'ghost';
  size?: 'md' | 'lg';
  fullWidth?: boolean;
  disabled?: boolean;
};

export function Button({
  label,
  onPress,
  variant = 'primary',
  size = 'md',
  fullWidth = false,
  disabled = false,
}: ButtonProps) {
  const theme = useTheme();

  const container: ViewStyle = {
    backgroundColor: variant === 'primary' ? theme.primary : 'transparent',
    borderWidth: variant === 'secondary' ? 1 : 0,
    borderColor: theme.ink,
    borderRadius: Radii.pill,
    height: size === 'lg' ? 56 : 52,
    paddingHorizontal: Spacing.four,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: fullWidth ? 'stretch' : 'flex-start',
    opacity: disabled ? 0.5 : 1,
  };

  const labelColor: ThemeColor = variant === 'primary' ? 'background' : 'ink';

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [container, pressed && !disabled && styles.pressed]}>
      <Text variant="label" color={labelColor}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pressed: { opacity: 0.85 },
});
