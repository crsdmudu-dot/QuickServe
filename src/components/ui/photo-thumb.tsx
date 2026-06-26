// photo-thumb.tsx — Displays a single booking photo with a type label and verified tick.
import { Image, StyleSheet, View } from 'react-native';

import { Radii, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { type BookingPhotoView } from '@/lib/photos';
import { Text } from '@/components/ui/text';

// Maps photo_type values to human-readable labels shown under the thumbnail.
const TYPE_LABEL: Record<string, string> = {
  issue: 'Issue',
  before: 'Before',
  after: 'After',
  completion: 'Completion',
};

export type PhotoThumbProps = {
  photo: BookingPhotoView;
};

/**
 * PhotoThumb — shows a 96×96 image (or a muted placeholder when no URL),
 * a caption label for the photo type, and a "✓ Verified" badge when
 * the photo has been verified by an admin.
 */
export function PhotoThumb({ photo }: PhotoThumbProps) {
  const theme = useTheme();

  return (
    <View style={styles.wrapper}>
      {/* Image or placeholder */}
      {photo.signedUrl ? (
        <Image
          testID="photo-image"
          source={{ uri: photo.signedUrl }}
          style={[styles.thumb, { borderRadius: Radii.lg }]}
          resizeMode="cover"
        />
      ) : (
        <View
          testID="photo-placeholder"
          style={[
            styles.thumb,
            styles.placeholder,
            { backgroundColor: theme.surfaceMuted, borderRadius: Radii.lg },
          ]}
        />
      )}

      {/* Type label */}
      <Text variant="caption" color="textSecondary" style={styles.label}>
        {TYPE_LABEL[photo.photo_type] ?? photo.photo_type}
      </Text>

      {/* Verified tick — only shown when admin has verified the photo */}
      {photo.is_verified && (
        <View style={[styles.verifiedPill, { backgroundColor: theme.primarySurface }]}>
          <Text variant="caption" color="primary">
            ✓ Verified
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    alignItems: 'center',
    gap: Spacing.one,
  },
  thumb: {
    width: 96,
    height: 96,
  },
  placeholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    marginTop: Spacing.one,
  },
  verifiedPill: {
    borderRadius: Radii.pill,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.half,
  },
});
