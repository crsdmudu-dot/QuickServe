// offline-banner.tsx — Full-width warning banner shown when the device is offline.
// Uses the warning surface token from the theme for a clear, non-intrusive alert.

import { StyleSheet, View } from 'react-native';

import { useTheme } from '@/hooks/use-theme';
import { useOnline } from '@/lib/net';
import { Text } from '@/components/ui/text';

/**
 * OfflineBanner renders a full-width warning banner at the top of the screen
 * whenever the device is detected as offline. Returns null when online.
 *
 * Wire this inside the app providers in `_layout.tsx` so it appears across
 * all user roles (customer / provider / admin).
 */
export function OfflineBanner() {
  const online = useOnline();
  const theme = useTheme();

  if (online) return null;

  return (
    <View
      testID="offline-banner"
      style={[styles.banner, { backgroundColor: theme.warningSurface }]}
    >
      <Text variant="caption" color="warning">
        You're offline — some data may be out of date.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    width: '100%',
    paddingVertical: 8,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
});
