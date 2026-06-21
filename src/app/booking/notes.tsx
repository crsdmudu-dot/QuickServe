/**
 * Notes screen — step 4 of the booking flow.
 *
 * The user can optionally add extra notes for the service provider.  This step
 * is always skippable — pressing Continue advances to the review screen even if
 * the field is empty.
 */

import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useBookingDraft } from '@/booking/booking-draft';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Text } from '@/components/ui/text';

export default function NotesScreen() {
  const theme = useTheme();
  const { notes, setNotes } = useBookingDraft();

  function handleContinue() {
    router.push('/booking/review');
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]}>
      <Text variant="title">Any special notes?</Text>
      <View style={styles.form}>
        <Input
          label="Notes (optional)"
          value={notes}
          onChangeText={setNotes}
          placeholder="E.g. use the back entrance, bring your own supplies…"
          multiline
        />
        <Button label="Continue" fullWidth onPress={handleContinue} />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, padding: Spacing.four, gap: Spacing.four },
  form: { gap: Spacing.three },
});
