/**
 * Success screen — shown after a booking is created.
 *
 * Confirms the booking and offers a single way back to Home.  We use
 * router.replace so the back gesture can't return into the booking flow.
 */

import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';

export default function SuccessScreen() {
  const theme = useTheme();

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]}>
      <View style={styles.content}>
        <Text style={styles.emoji}>🎉</Text>
        <Text variant="title" style={styles.center}>
          Booking created successfully
        </Text>
        <Text variant="body" color="textSecondary" style={styles.center}>
          We&apos;ve received your request and will be in touch shortly.
        </Text>
      </View>

      <Button label="Back to Home" fullWidth onPress={() => router.replace('/')} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, padding: Spacing.four, gap: Spacing.four },
  content: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.three },
  emoji: { fontSize: 56 },
  center: { textAlign: 'center' },
});
