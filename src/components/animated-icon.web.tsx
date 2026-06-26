/**
 * animated-icon.web.tsx  (web platform override)
 *
 * On web the splash overlay is not used — we simply return null immediately.
 * No Reanimated, no worklets.
 */

export function AnimatedSplashOverlay() {
  return null;
}
