// destination-summary.tsx — Read-only display of a resolved destination address.
// Uses formatDestination from @/lib/address-format to build the heading + detail lines.
// Handles old bookings gracefully (formatDestination is fallback-aware).

import { StyleSheet, View } from 'react-native';

import { Spacing } from '@/constants/theme';
import { formatDestination } from '@/lib/address-format';
import type { DestinationInput } from '@/lib/address-format';
import { Text } from '@/components/ui/text';

export type DestinationSummaryProps = {
  /** The destination data from a booking or draft. */
  input: DestinationInput;
};

/**
 * DestinationSummary displays a structured address for review (no actions).
 *
 * - `primary` is shown as a heading (label preferred; falls back to address text).
 * - Each `lines` entry (Building, Floor, Door/Unit, Landmark, Access) appears as
 *   a secondary caption below. Old bookings with no structured fields show only
 *   the primary line.
 */
export function DestinationSummary({ input }: DestinationSummaryProps) {
  const { primary, lines } = formatDestination(input);

  return (
    <View style={styles.container}>
      <Text variant="heading">{primary}</Text>
      {lines.map((line, index) => (
        <Text
          key={index}
          variant="caption"
          color="textSecondary"
          style={styles.line}>
          {line}
        </Text>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: Spacing.one,
    alignSelf: 'stretch',
  },
  line: {
    marginTop: 2,
  },
});
