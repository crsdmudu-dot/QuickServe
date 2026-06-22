// photo-gallery.tsx — Horizontal scrollable row of PhotoThumb cards for a booking.
import { type ReactNode } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { Spacing } from '@/constants/theme';
import { type BookingPhotoView } from '@/lib/photos';
import { Text } from '@/components/ui/text';
import { PhotoThumb } from '@/components/ui/photo-thumb';

export type PhotoGalleryProps = {
  photos: BookingPhotoView[];
  /** Optional per-photo action slot — e.g. a Delete button for admins. */
  renderActions?: (photo: BookingPhotoView) => ReactNode;
};

/**
 * PhotoGallery — renders all photos for a booking in a horizontal scroll row.
 * Shows a muted "No photos yet" message when the array is empty.
 * Pass `renderActions` to render extra controls (e.g. delete, verify) under
 * each thumbnail — useful on admin screens.
 */
export function PhotoGallery({ photos, renderActions }: PhotoGalleryProps) {
  if (photos.length === 0) {
    return (
      <Text variant="caption" color="textSecondary">
        No photos yet
      </Text>
    );
  }

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.row}
    >
      {photos.map((photo) => (
        <View key={photo.id} style={styles.item}>
          <PhotoThumb photo={photo} />
          {renderActions?.(photo)}
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: {
    gap: Spacing.three,
    paddingVertical: Spacing.two,
  },
  item: {
    alignItems: 'center',
    gap: Spacing.one,
  },
});
