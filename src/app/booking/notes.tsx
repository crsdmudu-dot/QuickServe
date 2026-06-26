/**
 * Notes screen — step 4 of the booking flow.
 *
 * The user can optionally add extra notes for the service provider and attach
 * issue photos from their library (local only — not uploaded until review).
 * This step is always skippable — pressing Continue advances to the review
 * screen even if the fields are empty.
 */

import { router } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useBookingDraft } from '@/booking/booking-draft';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { SectionHeader } from '@/components/ui/section-header';
import { Text } from '@/components/ui/text';

export default function NotesScreen() {
  const theme = useTheme();
  const { notes, setNotes, issuePhotos, addIssuePhoto, removeIssuePhoto } = useBookingDraft();

  function handleContinue() {
    router.push('/booking/review');
  }

  async function handlePickPhoto() {
    const { granted } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!granted) return;

    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'] });
    if (result.canceled) return;

    addIssuePhoto(result.assets[0].uri);
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Step indicator */}
        <Text variant="caption" color="textSecondary" style={styles.step}>
          Step 3 of 4
        </Text>

        <Text variant="title" style={styles.title}>
          Any special notes?
        </Text>
        <Text variant="body" color="textSecondary" style={styles.subtitle}>
          Optional — help your provider arrive prepared.
        </Text>

        <View style={styles.form}>
          <Input
            label="Notes (optional)"
            value={notes}
            onChangeText={setNotes}
            placeholder="E.g. use the back entrance, bring your own supplies…"
            multiline
          />

          {/* Issue photos section */}
          <View style={styles.photosSection}>
            <SectionHeader title="Add issue photos (optional)" />
            <Button label="Pick photo from library" onPress={handlePickPhoto} variant="secondary" />
            {issuePhotos.length > 0 && (
              <Text variant="caption" color="textSecondary">
                {issuePhotos.length} photo{issuePhotos.length !== 1 ? 's' : ''} selected
              </Text>
            )}
            {issuePhotos.map((uri) => (
              <View key={uri} style={styles.photoRow}>
                <Text variant="caption" numberOfLines={1} style={styles.photoUri}>
                  {uri}
                </Text>
                <TouchableOpacity onPress={() => removeIssuePhoto(uri)} testID={`remove-photo-${uri}`}>
                  <Text variant="caption" color="error">
                    Remove
                  </Text>
                </TouchableOpacity>
              </View>
            ))}
          </View>

          <Button label="Continue" fullWidth onPress={handleContinue} />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  scroll: {
    flexGrow: 1,
    padding: Spacing.four,
    gap: Spacing.three,
  },
  step: { marginBottom: Spacing.one },
  title: { marginBottom: Spacing.one },
  subtitle: { marginBottom: Spacing.two },
  form: { gap: Spacing.three },
  photosSection: { gap: Spacing.two },
  photoRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  photoUri: { flex: 1 },
});
