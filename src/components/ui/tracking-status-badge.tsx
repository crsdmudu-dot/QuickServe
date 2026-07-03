/**
 * TrackingStatusBadge — a pill-shaped label derived from the live tracking
 * state (booking status + optional distance).
 *
 * Returns null (renders nothing) when the status is not a trackable one
 * (e.g. "pending", "accepted", "cancelled").
 *
 * Presentation only — no permissions, no network, no GPS.
 */

import { StyleSheet, View } from 'react-native';

import { Radii, Spacing, type ThemeColor } from '@/constants/theme';
import { type BookingStatus } from '@/constants/booking-status';
import { useTheme } from '@/hooks/use-theme';
import { trackingLabel } from '@/lib/tracking-status';
import { Text } from '@/components/ui/text';

// ── Props ──────────────────────────────────────────────────────────────────

export type TrackingStatusBadgeProps = {
  /** Current booking status. */
  status: BookingStatus;
  /** Live distance between provider and customer in km. Optional. */
  distanceKm?: number | null;
};

// ── Color mapping ──────────────────────────────────────────────────────────
//
// Maps the label text to a semantic ThemeColor for the pill text and a
// corresponding surface color for the pill background.

type ColorPair = { text: ThemeColor; surface: ThemeColor };

function colorForLabel(label: string): ColorPair {
  switch (label) {
    case 'Arrived':
    case 'Work completed':
      return { text: 'success', surface: 'successSurface' };
    case 'Nearby':
      return { text: 'success', surface: 'successSurface' };
    case 'Heading to you':
      return { text: 'primary', surface: 'primarySurface' };
    case 'Work started':
      return { text: 'warning', surface: 'warningSurface' };
    default:
      return { text: 'textSecondary', surface: 'surfaceMuted' };
  }
}

// ── Component ──────────────────────────────────────────────────────────────

export function TrackingStatusBadge({ status, distanceKm }: TrackingStatusBadgeProps) {
  const theme = useTheme();

  // trackingLabel returns null for non-trackable statuses (pending, etc.).
  const label = trackingLabel(status, distanceKm ?? undefined);
  if (label == null) return null;

  const { text: textColor, surface: surfaceKey } = colorForLabel(label);

  return (
    <View style={[styles.pill, { backgroundColor: theme[surfaceKey] }]}>
      <Text variant="caption" color={textColor}>
        {label}
      </Text>
    </View>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  pill: {
    alignSelf: 'flex-start',
    borderRadius: Radii.pill,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.one,
  },
});
