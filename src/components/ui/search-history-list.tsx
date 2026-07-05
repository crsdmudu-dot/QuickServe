// search-history-list.tsx — Displays recent search history as chips with a clear action.
// Pure presentational — items are passed in by the screen (from getRecentSearches).
// onClear fires clearRecentSearches at the screen level; this component never calls the lib.

import { StyleSheet, TouchableOpacity, View } from 'react-native';

import { Radii, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { Text } from '@/components/ui/text';

export type SearchHistoryListProps = {
  /** Recent search terms (newest first) from getRecentSearches(). */
  items: string[];
  /** Called with the tapped search term. */
  onSelect: (term: string) => void;
  /** Called when the user taps "Clear" — screen handles clearRecentSearches(). */
  onClear: () => void;
};

/**
 * SearchHistoryList renders recent searches as tappable chips.
 * A "Clear" button appears at the end when items are present.
 * Renders nothing when items is empty.
 */
export function SearchHistoryList({ items, onSelect, onClear }: SearchHistoryListProps) {
  const theme = useTheme();

  if (items.length === 0) return null;

  return (
    <View style={styles.container}>
      {/* Header row */}
      <View style={styles.header}>
        <Text variant="label" weight="semibold" color="textSecondary">
          Recent searches
        </Text>
        <TouchableOpacity onPress={onClear} accessibilityRole="button" accessibilityLabel="Clear recent searches">
          <Text variant="caption" color="primary">
            Clear
          </Text>
        </TouchableOpacity>
      </View>

      {/* Chips */}
      <View style={styles.chips}>
        {items.map((term) => (
          <TouchableOpacity
            key={term}
            onPress={() => onSelect(term)}
            accessibilityRole="button"
            style={[
              styles.chip,
              {
                backgroundColor: theme.surfaceMuted,
                borderColor: theme.border,
              },
            ]}
          >
            <Text variant="caption" color="textSecondary">
              🕐
            </Text>
            <Text variant="caption">{term}</Text>
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
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.three,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
    paddingHorizontal: Spacing.three,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderRadius: Radii.pill,
    borderWidth: 1,
  },
});
