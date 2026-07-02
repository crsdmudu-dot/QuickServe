// selected-address-card.tsx — Shows a confirmed address with an optional static map thumbnail.
// Displays a Change button (ghost variant) so the user can go back to search.

import { Image, StyleSheet, View } from 'react-native';

import { Radii, Spacing } from '@/constants/theme';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Text } from '@/components/ui/text';

export type SelectedAddressCardProps = {
  /** The human-readable formatted address string to display. */
  formattedAddress: string;
  /** Static map thumbnail URL. Rendered only when this is a non-empty string. */
  mapUrl?: string | null;
  /** Called when the user taps the Change button. */
  onChange: () => void;
};

/**
 * SelectedAddressCard shows the selected address inside a Card, with:
 *  - The formatted address text.
 *  - A static map image thumbnail (only when mapUrl is a non-empty string).
 *  - A ghost "Change" button that calls onChange.
 */
export function SelectedAddressCard({ formattedAddress, mapUrl, onChange }: SelectedAddressCardProps) {
  const showMap = typeof mapUrl === 'string' && mapUrl.trim().length > 0;

  return (
    <Card style={styles.card}>
      {showMap && (
        <Image
          source={{ uri: mapUrl as string }}
          style={styles.mapThumbnail}
          resizeMode="cover"
          accessibilityLabel="Static map of selected address"
          testID="selected-address-map"
        />
      )}
      <View style={styles.addressRow}>
        <Text variant="body" style={styles.addressText}>
          {formattedAddress}
        </Text>
        <Button label="Change" variant="ghost" onPress={onChange} />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: 0,
    overflow: 'hidden',
  },
  mapThumbnail: {
    width: '100%',
    height: 160,
    borderRadius: Radii.lg,
  },
  addressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: Spacing.three,
    gap: Spacing.two,
  },
  addressText: {
    flex: 1,
  },
});
