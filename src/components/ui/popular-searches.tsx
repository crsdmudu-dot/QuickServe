// popular-searches.tsx — Displays POPULAR_SEARCHES as tappable chips.
// Pure presentational — fires onSelect with the tapped term.

import { StyleSheet, TouchableOpacity, View } from 'react-native';

import { POPULAR_SEARCHES } from '@/constants/discovery';
import { Radii, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { Text } from '@/components/ui/text';

export type PopularSearchesProps = {
  /** Called with the tapped popular search term. */
  onSelect: (term: string) => void;
};

/**
 * PopularSearches renders the static POPULAR_SEARCHES list from discovery.ts
 * as horizontally-wrapping tappable chips.
 */
export function PopularSearches({ onSelect }: PopularSearchesProps) {
  const theme = useTheme();

  return (
    <View style={styles.container}>
      <Text variant="label" weight="semibold" color="textSecondary" style={styles.heading}>
        Popular searches
      </Text>
      <View style={styles.chips}>
        {POPULAR_SEARCHES.map((term) => (
          <TouchableOpacity
            key={term}
            onPress={() => onSelect(term)}
            accessibilityRole="button"
            style={[
              styles.chip,
              {
                backgroundColor: theme.primarySurface,
                borderColor: theme.border,
              },
            ]}
          >
            <Text variant="caption" color="primary">
              {term}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: Spacing.two,
    paddingVertical: Spacing.one,
    paddingHorizontal: Spacing.three,
  },
  heading: {
    marginBottom: Spacing.one,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  chip: {
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderRadius: Radii.pill,
    borderWidth: 1,
  },
});
