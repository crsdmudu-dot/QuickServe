// search-suggestions.tsx — Renders auto-complete suggestions as tappable rows.
// Uses searchSuggestions(query) from lib/search.ts (pure, no network).
// Returns nothing when query is empty.

import { StyleSheet, TouchableOpacity, View } from 'react-native';

import { searchSuggestions } from '@/lib/search';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { Text } from '@/components/ui/text';

export type SearchSuggestionsProps = {
  /** Current search query. Empty string → renders nothing. */
  query: string;
  /** Called with the selected suggestion string. */
  onSelect: (term: string) => void;
};

/**
 * SearchSuggestions renders up to 6 tappable suggestion rows derived from
 * `searchSuggestions(query)`. Renders nothing for an empty/whitespace query.
 */
export function SearchSuggestions({ query, onSelect }: SearchSuggestionsProps) {
  const theme = useTheme();
  const suggestions = searchSuggestions(query);

  if (!query.trim() || suggestions.length === 0) return null;

  return (
    <View style={[styles.container, { backgroundColor: theme.background, borderColor: theme.border }]}>
      {suggestions.map((term) => (
        <TouchableOpacity
          key={term}
          onPress={() => onSelect(term)}
          accessibilityRole="button"
          style={[styles.row, { borderBottomColor: theme.border }]}
        >
          <Text variant="caption" color="textSecondary" style={styles.icon}>
            🔍
          </Text>
          <Text variant="body" numberOfLines={1}>
            {term}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderWidth: 1,
    borderRadius: 12,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: Spacing.two,
  },
  icon: {
    fontSize: 14,
  },
});
