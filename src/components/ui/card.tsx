import { Animated, Pressable, StyleSheet, View, type ViewProps } from 'react-native';
import { useRef } from 'react';

import { Radii, Shadows, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export type CardElevation = 'e1' | 'e2' | 'e3';

export type CardProps = ViewProps & {
  onPress?: () => void;
  elevation?: CardElevation;
};

const elevationShadow = {
  e1: Shadows.e1,
  e2: Shadows.e2,
  e3: Shadows.e3,
} as const;

export function Card({ style, onPress, children, elevation = 'e1', ...rest }: CardProps) {
  const theme = useTheme();
  const shadow = elevationShadow[elevation];

  const scaleAnim = useRef(new Animated.Value(1)).current;
  const opacityAnim = useRef(new Animated.Value(1)).current;

  const base = [
    styles.card,
    shadow,
    { backgroundColor: theme.background, borderColor: theme.border },
    style,
  ];

  if (onPress) {
    function handlePressIn() {
      Animated.parallel([
        Animated.timing(scaleAnim, {
          toValue: 0.97,
          duration: 100,
          useNativeDriver: true,
        }),
        Animated.timing(opacityAnim, {
          toValue: 0.9,
          duration: 100,
          useNativeDriver: true,
        }),
      ]).start();
    }

    function handlePressOut() {
      Animated.parallel([
        Animated.timing(scaleAnim, {
          toValue: 1,
          duration: 150,
          useNativeDriver: true,
        }),
        Animated.timing(opacityAnim, {
          toValue: 1,
          duration: 150,
          useNativeDriver: true,
        }),
      ]).start();
    }

    return (
      <Pressable
        onPress={onPress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        accessibilityRole="button"
        {...rest}>
        <Animated.View
          style={[base, { transform: [{ scale: scaleAnim }], opacity: opacityAnim }]}>
          {children}
        </Animated.View>
      </Pressable>
    );
  }

  return (
    <View style={base} {...rest}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: Radii.lg,
    borderWidth: StyleSheet.hairlineWidth,
    padding: Spacing.three,
  },
});
