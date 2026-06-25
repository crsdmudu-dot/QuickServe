// skeleton.tsx — Token-driven loading placeholder with a subtle shimmer.
// Uses React Native's built-in Animated API (no native Worklets needed) for a
// gentle opacity pulse; respects OS "Reduce Motion" preference by rendering a
// static block when reduced motion is enabled.

import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View } from 'react-native';

import { Durations, prefersReducedMotion } from '@/constants/motion';
import { Radii } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export type SkeletonProps = {
  /** Block width. Accepts a pixel number or a percentage string. Default: '100%'. */
  width?: number | `${number}%`;
  /** Block height in pixels. Default: 16. */
  height?: number;
  /** Border radius in pixels. Default: Radii.md. */
  radius?: number;
  /** Optional testID forwarded to the outer block for style assertions. */
  testID?: string;
};

/**
 * Skeleton renders a rounded loading placeholder block.
 *
 * - Shimmer: gentle opacity ping-pong (1.0 → 0.4 → 1.0) via Animated.loop.
 * - Reduced motion: no animation loop; static block at full opacity.
 * - Tokens: background from `theme.neutral200`, border radius from `Radii.md`.
 */
export function Skeleton({
  width = '100%',
  height = 16,
  radius,
  testID,
}: SkeletonProps) {
  const theme = useTheme();
  const opacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    let animation: Animated.CompositeAnimation | null = null;

    // Check the OS "Reduce Motion" setting asynchronously.
    // If reduced motion is on, keep the block static (no loop).
    prefersReducedMotion().then((reduced) => {
      if (reduced) return;

      // Gentle ping-pong: 1.0 → 0.4 → 1.0, repeating forever.
      animation = Animated.loop(
        Animated.sequence([
          Animated.timing(opacity, {
            toValue: 0.4,
            duration: Durations.slow,
            useNativeDriver: true,
          }),
          Animated.timing(opacity, {
            toValue: 1,
            duration: Durations.slow,
            useNativeDriver: true,
          }),
        ]),
      );

      animation.start();
    });

    return () => {
      animation?.stop();
      opacity.setValue(1);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const blockRadius = radius ?? Radii.md;

  return (
    <Animated.View
      testID={testID}
      style={[
        styles.block,
        {
          width,
          height,
          borderRadius: blockRadius,
          backgroundColor: theme.neutral200,
          opacity,
        },
      ]}
    />
  );
}

const styles = StyleSheet.create({
  block: {
    overflow: 'hidden',
  },
});
