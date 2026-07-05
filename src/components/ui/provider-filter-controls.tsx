// provider-filter-controls.tsx — Toggle chips for provider filters + minRating selector.
// Pure presentational — fires onChange with the updated ProviderFilters.
// Filters are additive/combinable: toggling one key only changes that key.

import { StyleSheet, TouchableOpacity, View } from 'react-native';

import type { ProviderFilters } from '@/constants/discovery';
import { Radii, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { Text } from '@/components/ui/text';

export type ProviderFilterControlsProps = {
  /** Current filter values. */
  value: ProviderFilters;
  /** Called with the updated ProviderFilters when a filter changes. */
  onChange: (filters: ProviderFilters) => void;
};

/** Rating options shown in the minRating selector. */
const RATING_OPTIONS: (number | undefined)[] = [undefined, 3, 3.5, 4, 4.5, 5];

/**
 * ProviderFilterControls renders toggle chips for the boolean filters and a
 * minRating selector. All filters are additive — toggling one updates only
 * that key in the ProviderFilters object; others remain unchanged.
 */
export function ProviderFilterControls({ value, onChange }: ProviderFilterControlsProps) {
  const theme = useTheme();

  function toggle(key: keyof Pick<ProviderFilters, 'verifiedOnly' | 'availableOnly' | 'favoritesOnly' | 'recentlyUsedOnly'>) {
    onChange({ ...value, [key]: !value[key] });
  }

  function setMinRating(rating: number | undefined) {
    onChange({ ...value, minRating: rating });
  }

  const boolFilters: { key: keyof Pick<ProviderFilters, 'verifiedOnly' | 'availableOnly' | 'favoritesOnly' | 'recentlyUsedOnly'>; label: string }[] = [
    { key: 'verifiedOnly', label: 'Verified only' },
    { key: 'availableOnly', label: 'Available now' },
    { key: 'favoritesOnly', label: 'Favorites' },
    { key: 'recentlyUsedOnly', label: 'Recently used' },
  ];

  return (
    <View style={styles.container}>
      {/* Boolean toggle chips */}
      <View style={styles.row}>
        {boolFilters.map(({ key, label }) => {
          const isActive = !!value[key];
          return (
            <TouchableOpacity
              key={key}
              onPress={() => toggle(key)}
              accessibilityRole="button"
              accessibilityState={{ selected: isActive }}
              style={[
                styles.chip,
                {
                  backgroundColor: isActive ? theme.primary : theme.surfaceMuted,
                  borderColor: isActive ? theme.primary : theme.border,
                },
              ]}
            >
              <Text
                variant="caption"
                color={isActive ? 'background' : 'textSecondary'}
                weight={isActive ? 'semibold' : 'regular'}
              >
                {label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Min rating selector */}
      <View style={styles.ratingRow}>
        <Text variant="caption" color="textSecondary" style={styles.ratingLabel}>
          Min rating:
        </Text>
        {RATING_OPTIONS.map((rating) => {
          const isSelected = value.minRating === rating;
          const label = rating == null ? 'Any' : `${rating}★`;
          return (
            <TouchableOpacity
              key={label}
              onPress={() => setMinRating(rating)}
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
                {label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.one,
  },
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  ratingRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: Spacing.two,
  },
  ratingLabel: {
    marginRight: Spacing.one,
  },
  chip: {
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderRadius: Radii.pill,
    borderWidth: 1,
  },
});
