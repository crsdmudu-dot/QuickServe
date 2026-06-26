import { ActivityIndicator, Pressable, StyleSheet, type ViewStyle } from 'react-native';
import * as Haptics from 'expo-haptics';

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
  loading?: boolean;
};

export function Button({
  label,
  onPress,
  variant = 'primary',
  size = 'md',
  fullWidth = false,
  disabled = false,
  loading = false,
}: ButtonProps) {
  const theme = useTheme();

  const isDisabled = disabled || loading;

  const container: ViewStyle = {
    backgroundColor: variant === 'primary' ? theme.primary : 'transparent',
    borderWidth: variant === 'secondary' ? 1 : 0,
    borderColor: variant === 'secondary' ? theme.border : undefined,
    borderRadius: Radii.pill,
    height: size === 'lg' ? 56 : 52,
    paddingHorizontal: Spacing.four,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: fullWidth ? 'stretch' : 'flex-start',
    opacity: isDisabled ? 0.5 : 1,
    flexDirection: 'row',
    gap: Spacing.two,
  };

  const labelColor: ThemeColor = variant === 'primary' ? 'background' : 'ink';

  function handlePress() {
    if (onPress) {
      if (variant === 'primary') {
        // Light haptic impact on primary press — safe in tests (jest-expo mocks expo-haptics)
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      }
      onPress();
    }
  }

  return (
    <Pressable
      onPress={handlePress}
      disabled={isDisabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: isDisabled }}
      style={({ pressed }) => [
        container,
        pressed && !isDisabled && variant === 'primary' && styles.pressedPrimary,
        pressed && !isDisabled && variant !== 'primary' && styles.pressed,
      ]}>
      {loading ? (
        <ActivityIndicator
          size="small"
          color={variant === 'primary' ? theme.background : theme.primary}
        />
      ) : null}
      <Text variant="label" color={labelColor}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pressed: { opacity: 0.85 },
  pressedPrimary: { opacity: 0.85 },
});
