// address-search.tsx — Debounced address search with autocomplete suggestions.
// Data comes from @/lib/places (Edge Function proxy); no Google key in the app.
// Always shows a manual-entry button so users can bypass autocomplete.

import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Spacing } from '@/constants/theme';
import { getPlaceDetails, newSessionToken, searchPlaces } from '@/lib/places';
import type { PlaceDetailsWithMap, PlaceSuggestion } from '@/lib/places';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Text } from '@/components/ui/text';

export type AddressSearchProps = {
  /** Called when the user selects a suggestion and details load successfully. */
  onSelect: (details: PlaceDetailsWithMap, suggestion: PlaceSuggestion) => void;
  /** Called when the user taps "Enter address manually". Always wired up. */
  onManual?: () => void;
};

/**
 * AddressSearch renders a debounced text input that queries the places
 * autocomplete Edge Function and shows suggestions as pressable Card rows.
 *
 * Loading state → Skeleton rows.
 * Suggestions → Card list.
 * No matches (after a real search) → EmptyState.
 * Error → inline caption.
 */
export function AddressSearch({ onSelect, onManual }: AddressSearchProps) {
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false); // true after the first completed call
  const [searchError, setSearchError] = useState<string | null>(null);
  const [selectError, setSelectError] = useState<string | null>(null);

  // One Places (New) session token per search session — correlates the autocomplete
  // requests with the Place Details call for billing. Created lazily on the first real
  // query, reused for every keystroke-batch, passed to getPlaceDetails on selection,
  // then rotated so the next search starts a fresh session. Never per-keystroke.
  const sessionTokenRef = useRef<string | null>(null);
  function ensureSessionToken(): string {
    if (!sessionTokenRef.current) sessionTokenRef.current = newSessionToken();
    return sessionTokenRef.current;
  }

  // Debounce: wait 350 ms after the user stops typing before calling the API.
  useEffect(() => {
    // Clear previous results when the query changes.
    setSearchError(null);
    setSelectError(null);

    if (!query.trim()) {
      // Empty query → clear everything; no API call. Abandoning the search also ends
      // the session, so drop the token (the next search will start a new one).
      setSuggestions([]);
      setSearched(false);
      setLoading(false);
      sessionTokenRef.current = null;
      return;
    }

    setLoading(true);
    const timer = setTimeout(async () => {
      try {
        // Reuse the current session token (created once per session, not per keystroke).
        const results = await searchPlaces(query, ensureSessionToken());
        setSuggestions(results);
        setSearched(true);
      } catch {
        setSearchError('Something went wrong. Please try again.');
        setSuggestions([]);
        setSearched(false);
      } finally {
        setLoading(false);
      }
    }, 350);

    return () => clearTimeout(timer);
  }, [query]);

  async function handleSelect(suggestion: PlaceSuggestion) {
    setSelectError(null);
    // Complete the session with the SAME token used for autocomplete.
    const details = await getPlaceDetails(suggestion.placeId, sessionTokenRef.current ?? undefined);
    // The Place Details request ends the billing session — rotate so a later search
    // (e.g. after "Change address") begins a fresh one.
    sessionTokenRef.current = null;
    if (details) {
      onSelect(details, suggestion);
    } else {
      setSelectError("Couldn't load that address. Please try another or enter manually.");
    }
  }

  return (
    <View style={styles.container}>
      <Input
        label="Search address"
        value={query}
        onChangeText={setQuery}
        placeholder="Type your address…"
      />

      {/* Loading skeletons */}
      {loading && (
        <View style={styles.list} testID="address-search-loading">
          <Skeleton height={52} testID="skeleton-row-1" />
          <Skeleton height={52} testID="skeleton-row-2" />
          <Skeleton height={52} testID="skeleton-row-3" />
        </View>
      )}

      {/* Suggestion list */}
      {!loading && suggestions.length > 0 && (
        <View style={styles.list} testID="address-search-suggestions">
          {suggestions.map((s) => (
            <Card key={s.placeId} onPress={() => handleSelect(s)} style={styles.row}>
              <Text variant="body" weight="semibold">
                {s.primaryText}
              </Text>
              <Text variant="caption" color="textSecondary">
                {s.secondaryText}
              </Text>
            </Card>
          ))}
        </View>
      )}

      {/* No matches after a completed search */}
      {!loading && searched && suggestions.length === 0 && !searchError && (
        <EmptyState
          icon="🔍"
          title="No matches"
          message="Try a different search or enter your address manually."
        />
      )}

      {/* Search error caption */}
      {searchError && (
        <Text variant="caption" color="error" style={styles.errorCaption}>
          {searchError}
        </Text>
      )}

      {/* Tap-a-suggestion error caption */}
      {selectError && (
        <Text variant="caption" color="error" style={styles.errorCaption}>
          {selectError}
        </Text>
      )}

      {/* Manual entry — always available */}
      <Pressable onPress={() => onManual?.()} accessibilityRole="button" style={styles.manual}>
        <Text variant="caption" color="primary">
          Enter address manually
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: Spacing.three,
    alignSelf: 'stretch',
  },
  list: {
    gap: Spacing.two,
  },
  row: {
    gap: Spacing.one,
  },
  errorCaption: {
    marginTop: Spacing.one,
  },
  manual: {
    alignSelf: 'flex-start',
    paddingVertical: Spacing.one,
  },
});
