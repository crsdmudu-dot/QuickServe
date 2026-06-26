/**
 * Success screen — shown after a booking is created.
 *
 * Confirms the booking and offers a single way back to Home.  We use
 * router.replace so the back gesture can't return into the booking flow.
 * If the photoWarning param is '1', a muted notice is shown telling the
 * customer that some issue photos failed to upload and can be added later.
 */

import { router, useLocalSearchParams } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Radii, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';

export default function SuccessScreen() {
  const theme = useTheme();
  const { photoWarning } = useLocalSearchParams<{ photoWarning?: string }>();

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]}>
      <View style={styles.content}>
        {/* Celebratory icon in a tinted circle */}
        <View style={[styles.iconCircle, { backgroundColor: theme.primarySurface }]}>
          <Text style={styles.emoji}>🎉</Text>
        </View>

        <Text variant="display" style={styles.center}>
          Booking created successfully
        </Text>
        <Text variant="body" color="textSecondary" style={styles.center}>
          We&apos;ve received your request and will be in touch shortly.
        </Text>
        {photoWarning === '1' && (
          <Text variant="caption" color="textSecondary" style={styles.center}>
            Booking created — some photos couldn&apos;t be uploaded. You can add them from the
            booking later.
          </Text>
        )}
      </View>

      <Button label="Back to Home" fullWidth onPress={() => router.replace('/')} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, padding: Spacing.four, gap: Spacing.four },
  content: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.four },
  iconCircle: {
    width: 104,
    height: 104,
    borderRadius: Radii.xl,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.two,
  },
  emoji: { fontSize: 52 },
  center: { textAlign: 'center' },
});
