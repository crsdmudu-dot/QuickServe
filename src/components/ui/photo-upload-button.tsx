// photo-upload-button.tsx — Triggers image-picker then uploads to Supabase Storage.
import { useState } from 'react';
import { View, StyleSheet } from 'react-native';
import * as ImagePicker from 'expo-image-picker';

import { Spacing } from '@/constants/theme';
import { type PhotoType, uploadBookingPhoto } from '@/lib/photos';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';

export type PhotoUploadButtonProps = {
  /** The booking this photo belongs to. */
  bookingId: string;
  /** What role the photo plays in the job flow. */
  photoType: PhotoType;
  /** Text shown on the button, e.g. "Add Before Photo". */
  label: string;
  /** Called after a successful upload so the parent can refresh. */
  onUploaded?: () => void;
};

/**
 * PhotoUploadButton — a single button that:
 *   1. Requests media-library permission.
 *   2. Opens the image picker.
 *   3. Uploads the chosen image via uploadBookingPhoto.
 *   4. Calls onUploaded() on success or shows an inline error on failure.
 *
 * The button is disabled while the upload is in progress to prevent
 * double-submissions.
 */
export function PhotoUploadButton({
  bookingId,
  photoType,
  label,
  onUploaded,
}: PhotoUploadButtonProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handlePress() {
    setError(null);

    // Step 1 — ask for media library permission
    const { granted } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!granted) return;

    // Step 2 — open the image picker
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
    });

    // If the user cancelled, do nothing
    if (result.canceled) return;

    // Step 3 — upload the selected image
    setBusy(true);
    const uri = result.assets[0].uri;
    const { ok, error: uploadError } = await uploadBookingPhoto({
      bookingId,
      uri,
      photoType,
    });
    setBusy(false);

    if (ok) {
      onUploaded?.();
    } else {
      setError(uploadError ?? 'Upload failed. Please try again.');
    }
  }

  return (
    <View style={styles.wrapper}>
      <Button label={label} onPress={handlePress} disabled={busy} />
      {error && (
        <Text variant="caption" color="error" style={styles.errorText}>
          {error}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    gap: Spacing.two,
  },
  errorText: {
    marginTop: Spacing.one,
  },
});
