// quality-action-badge.tsx — A token-coloured pill showing a provider quality action type.
// Mirrors the StatusBadge primitive — presentational only.
// NO import of @/lib/operations or any private admin tables.

import { StyleSheet, View } from 'react-native';

import { Radii, Spacing } from '@/constants/theme';
import { QUALITY_ACTION_TYPES, type QualityActionType } from '@/constants/provider-quality';
import { Text } from '@/components/ui/text';

export type QualityActionBadgeProps = {
  actionType: QualityActionType;
};

export function QualityActionBadge({ actionType }: QualityActionBadgeProps) {
  const meta = QUALITY_ACTION_TYPES.find((t) => t.id === actionType);
  // Fallback to a neutral grey if somehow an unknown type is passed
  const color = meta?.color ?? '#6B7280';
  const label = meta?.label ?? actionType;

  // Produce a light background from the hex color at ~12% opacity
  const bgStyle = { backgroundColor: color + '1F' }; // hex opacity ~12%

  return (
    <View style={[styles.pill, bgStyle]}>
      <Text variant="caption" style={[styles.label, { color }]}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    alignSelf: 'flex-start',
    borderRadius: Radii.pill,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.one,
  },
  label: {
    fontWeight: '500',
  },
});
