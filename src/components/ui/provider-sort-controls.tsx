// provider-sort-controls.tsx — Horizontal chip list for selecting provider sort order.
// Pure presentational — fires onChange with the selected ProviderSortKey.

import { ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';

import { PROVIDER_SORTS, type ProviderSortKey } from '@/constants/discovery';
import { Radii, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { Text } from '@/components/ui/text';

export type ProviderSortControlsProps = {
  /** The currently selected sort key. */
  value: ProviderSortKey;
  /** Called with the new key when a chip is tapped. */
  onChange: (key: ProviderSortKey) => void;
};

/**
 * ProviderSortControls renders a horizontally scrollable row of sort chips.
 * The selected chip is highlighted with the primary colour.
 * Chips are sourced from PROVIDER_SORTS in discovery.ts.
 */
export function ProviderSortControls({ value, onChange }: ProviderSortControlsProps) {
  const theme = useTheme();

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.row}
    >
      {PROVIDER_SORTS.map((sort) => {
        const isSelected = sort.id === value;
        return (
          <TouchableOpacity
            key={sort.id}
            onPress={() => onChange(sort.id)}
            accessibilityRole="button"
            accessibilityState={{ selected: isSelected }}
            style={[
              styles.chip,
              {
                backgroundColor: isSelected ? theme.primary : theme.surfaceMuted,
                borderColor: isSelected ? theme.primary : theme.border,
              },
            ]}
          >
            <Text
              variant="caption"
              color={isSelected ? 'background' : 'textSecondary'}
              weight={isSelected ? 'semibold' : 'regular'}
            >
              {sort.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.one,
  },
  chip: {
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderRadius: Radii.pill,
    borderWidth: 1,
  },
});
