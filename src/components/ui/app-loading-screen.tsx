import { LinearGradient } from 'expo-linear-gradient';
import { ActivityIndicator, StyleSheet } from 'react-native';

import { Colors } from '@/constants/theme';

/**
 * Full-screen branded loading view shown while the root auth state is still resolving.
 *
 * It uses the SAME green gradient as the animated splash overlay (see
 * `src/components/animated-icon.tsx`) so that when the timed splash overlay lifts BEFORE
 * auth has finished — a physical cold-relaunch race — the frame underneath is an identical
 * green, never a BLACK screen. Used by `src/app/index.tsx` in place of a bare `null`.
 */
export function AppLoadingScreen() {
  return (
    <LinearGradient
      testID="app-loading-screen"
      colors={[Colors.light.primaryDeep, Colors.light.primary]}
      style={styles.fill}
    >
      <ActivityIndicator color="#FFFFFF" />
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
