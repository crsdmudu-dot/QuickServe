import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/ui/button';
import { SupportLink } from '@/components/ui/support-link';
import { Text } from '@/components/ui/text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/**
 * `+not-found` — the screen Expo Router shows for a route that does not exist.
 *
 * Reached by a stale emailed link, an old deep link or a mistyped path, so the user is stuck with
 * no obvious way forward. It offers a way back into the app and a route to support.
 */
export default function NotFoundScreen() {
  const theme = useTheme();
  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]}>
      <View style={styles.box}>
        <Text variant="title">This screen does not exist.</Text>
        <Text variant="body" color="textSecondary">
          The link may be out of date, or the page may have moved.
        </Text>
        <Button label="Go to home" fullWidth size="lg" onPress={() => router.replace('/')} />
        <SupportLink />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, paddingHorizontal: Spacing.four },
  box: { flex: 1, justifyContent: 'center', gap: Spacing.three },
});
