import { router } from 'expo-router';
import { StyleSheet, Text as RNText, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';

export default function WelcomeScreen() {
  const theme = useTheme();
  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]}>
      <View style={styles.hero}>
        <RNText style={styles.mark}>⚡</RNText>
        <Text variant="display">QuickServe</Text>
        <Text variant="body" color="textSecondary" style={styles.tagline}>
          Premium services, on demand.
        </Text>
      </View>
      <Button label="Get Started" fullWidth onPress={() => router.push('/role-select')} />
      <View style={styles.loginRow}>
        <Text variant="body" color="textSecondary">Already have an account? </Text>
        <Text variant="label" color="primary" onPress={() => router.push('/login')}>Log in</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, padding: Spacing.four, justifyContent: 'space-between' },
  hero: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.two },
  mark: { fontSize: 64 },
  tagline: { textAlign: 'center' },
  loginRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginTop: Spacing.three },
});
