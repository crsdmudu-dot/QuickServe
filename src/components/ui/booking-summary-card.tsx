/**
 * BookingSummaryCard — a read-only summary of the booking draft.
 *
 * Shown on the review screen so the customer can confirm the details before
 * placing the booking.  Each detail is rendered as a labelled row inside a Card
 * using the Slice 1 design tokens.
 *
 * Slice 24: adds optional scheduling props (schedulingType, timeWindow,
 * windowStart, windowEnd, recurrence) so the shared card can display rich
 * schedule descriptions.  All new props are optional — callers that have not
 * yet been updated (admin, provider) continue to render via the legacy fallback
 * inside describeSchedule (plain date/time from scheduledFor).
 */

import { StyleSheet, View } from 'react-native';

import { Radii, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { describeSchedule, recurrenceLabel } from '@/lib/scheduling';
import { Card } from '@/components/ui/card';
import { Text } from '@/components/ui/text';

export type BookingSummaryCardProps = {
  serviceTitle: string;
  address: string;
  scheduledFor: string;
  notes: string;
  // Slice 24 scheduling — all optional; omitting them triggers the legacy fallback.
  schedulingType?: string | null;
  timeWindow?: string | null;
  windowStart?: string | null;
  windowEnd?: string | null;
  recurrence?: string | null;
};

export function BookingSummaryCard({
  serviceTitle,
  address,
  scheduledFor,
  notes,
  schedulingType,
  timeWindow,
  windowStart,
  windowEnd,
  recurrence,
}: BookingSummaryCardProps) {
  const theme = useTheme();

  // Build the human-readable "When" description.
  // describeSchedule never throws; legacy callers (missing scheduling_type) get a
  // plain "Today, 10:00 AM"-style string from scheduledFor alone.
  const when = describeSchedule({
    scheduled_for: scheduledFor,
    scheduling_type: schedulingType,
    time_window: timeWindow,
    window_start: windowStart,
    window_end: windowEnd,
  });

  // ASAP badge: shown only when scheduling_type is 'asap'.
  const showAsap = schedulingType === 'asap';

  // Recurring badge: shown when recurrence is set and is NOT 'one_time'.
  const showRecurring = Boolean(recurrence) && recurrence !== 'one_time';
  const recurringText = showRecurring ? recurrenceLabel(recurrence!) : '';

  return (
    <Card elevation="e1" style={styles.card}>
      <Row label="Service" value={serviceTitle} />
      <Row label="Address" value={address} />

      {/* "When" row with optional badges */}
      <View style={styles.row}>
        <Text variant="caption" color="textSecondary">
          When
        </Text>
        <Text variant="body">{when}</Text>

        {/* ASAP badge */}
        {showAsap && (
          <View
            testID="asap-badge"
            style={[styles.badge, { backgroundColor: theme.primarySurface }]}
          >
            <Text variant="caption" color="primary">
              ASAP
            </Text>
          </View>
        )}

        {/* Recurring badge */}
        {showRecurring && (
          <View
            testID="recurring-badge"
            style={[styles.badge, { backgroundColor: theme.infoSurface }]}
          >
            <Text variant="caption" color="info">
              {recurringText}
            </Text>
          </View>
        )}
      </View>

      <Row label="Notes" value={notes.trim() ? notes : 'None'} />
    </Card>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text variant="caption" color="textSecondary">
        {label}
      </Text>
      <Text variant="body">{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { gap: Spacing.three },
  row: { gap: Spacing.one },
  badge: {
    alignSelf: 'flex-start',
    borderRadius: Radii.pill,
    paddingHorizontal: Spacing.two,
    paddingVertical: 2,
    marginTop: Spacing.one,
  },
});
