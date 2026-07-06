// strength-improvement-tags.tsx — Two labeled groups of tag chips.
// Strengths (positive tags) and improvement areas (negative tags).
// Tag keys are humanized using the REVIEW_TAGS lookup.
// Empty groups render a gentle empty hint.
// NO import of @/lib/operations or any private admin tables.

import { StyleSheet, View } from 'react-native';

import { Radii, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { REVIEW_TAGS } from '@/lib/reviews';
import { Text } from '@/components/ui/text';

export type StrengthImprovementTagsProps = {
  strengths: string[];
  improvements: string[];
};

/** Humanize a tag key using the REVIEW_TAGS lookup, or fallback to a prettified key. */
function humanizeTag(key: string): string {
  const found = REVIEW_TAGS.find((t) => t.key === key);
  if (found) return found.label;
  // Fallback: replace underscores with spaces, capitalize first letter
  return key
    .replace(/_/g, ' ')
    .replace(/^\w/, (c) => c.toUpperCase());
}

export function StrengthImprovementTags({
  strengths,
  improvements,
}: StrengthImprovementTagsProps) {
  const theme = useTheme();

  return (
    <View style={styles.container}>
      {/* ── Strengths ── */}
      <View style={styles.group}>
        <Text variant="label" weight="medium" color="textSecondary">
          Strengths
        </Text>
        {strengths.length === 0 ? (
          <Text variant="caption" color="textTertiary">
            No strengths recorded yet.
          </Text>
        ) : (
          <View style={styles.chips}>
            {strengths.map((key) => (
              <View
                key={key}
                style={[styles.chip, { backgroundColor: theme.successSurface, borderColor: theme.success }]}>
                <Text variant="caption" color="success">
                  {humanizeTag(key)}
                </Text>
              </View>
            ))}
          </View>
        )}
      </View>

      {/* ── Improvements ── */}
      <View style={styles.group}>
        <Text variant="label" weight="medium" color="textSecondary">
          Areas to improve
        </Text>
        {improvements.length === 0 ? (
          <Text variant="caption" color="textTertiary">
            No improvement areas noted — great work!
          </Text>
        ) : (
          <View style={styles.chips}>
            {improvements.map((key) => (
              <View
                key={key}
                style={[styles.chip, { backgroundColor: theme.warningSurface, borderColor: theme.warning }]}>
                <Text variant="caption" color="warning">
                  {humanizeTag(key)}
                </Text>
              </View>
            ))}
          </View>
        )}
      </View>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    gap: Spacing.three,
  },
  group: {
    gap: Spacing.two,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.one,
  },
  chip: {
    borderRadius: Radii.pill,
    borderWidth: 1,
    paddingHorizontal: Spacing.two,
    paddingVertical: 3,
  },
});
