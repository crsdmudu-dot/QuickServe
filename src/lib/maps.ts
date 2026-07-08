// maps.ts — builds a platform-appropriate turn-by-turn directions URL.
import { Platform } from 'react-native';

/**
 * Returns a directions URL to (lat, lng):
 *   iOS      → Apple Maps (https)
 *   Android  → Google Maps turn-by-turn intent (unchanged from prior behavior)
 *   other    → Google Maps directions web URL
 *
 * Implementation note: we branch on Platform.OS rather than Platform.select so
 * that the runtime value of Platform.OS is evaluated at call time. This keeps
 * the function testable across all three branches in the Jest ios-defaultPlatform
 * environment (where Platform.select always resolves the ios spec key regardless
 * of Platform.OS mutations).
 */
export function buildDirectionsUrl(lat: number, lng: number): string {
  if (Platform.OS === 'ios') {
    return `https://maps.apple.com/?daddr=${lat},${lng}`;
  }
  if (Platform.OS === 'android') {
    return `google.navigation:q=${lat},${lng}`;
  }
  return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
}
