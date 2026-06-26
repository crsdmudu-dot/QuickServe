import { AccessibilityInfo, Easing, type EasingFunction } from 'react-native';

/**
 * Duration presets (milliseconds).
 * Use `fast` for micro-interactions (icon swaps, toggles),
 * `base` for standard transitions (sheet opens, page fades),
 * `slow` for large layout shifts or hero animations.
 */
export const Durations = {
  fast: 150,
  base: 250,
  slow: 400,
} as const;

/**
 * Easing presets sourced from React Native's `Easing` module.
 * These are compatible with both `Animated` and `react-native-reanimated`
 * (pass to `withTiming`'s `easing` option).
 *
 * - `standard`    — ease-in-out cubic; smooth start and finish, general purpose.
 * - `decelerate`  — ease-out cubic; element enters at speed and slows to rest.
 * - `accelerate`  — ease-in cubic; element leaves slowly and accelerates out.
 */
export const Easings: Record<'standard' | 'decelerate' | 'accelerate', EasingFunction> = {
  standard: Easing.inOut(Easing.cubic),
  decelerate: Easing.out(Easing.cubic),
  accelerate: Easing.in(Easing.cubic),
};

/**
 * Spring presets for `withSpring` (react-native-reanimated).
 *
 * - `gentle`  — comfortable settling; ideal for drawers, modals, list items.
 * - `snappy`  — faster, tighter spring; ideal for button feedback, toggles.
 */
export const Springs = {
  gentle: { damping: 18, stiffness: 160 },
  snappy: { damping: 14, stiffness: 220 },
} as const;

/**
 * Returns `true` when the OS "Reduce Motion" accessibility setting is enabled.
 * Always await this before starting animations to respect the user's preference.
 *
 * @example
 * const reduced = await prefersReducedMotion();
 * if (!reduced) {
 *   // run full animation
 * }
 */
export async function prefersReducedMotion(): Promise<boolean> {
  return AccessibilityInfo.isReduceMotionEnabled();
}
