/**
 * BookingSummaryCard — a read-only summary of the booking draft.
 *
 * Shown on the review screen so the customer can confirm the details before
 * placing the booking.  Each detail is rendered as a labelled row inside a Card
 * using the Slice 1 design tokens.
 */

import { StyleSheet, View } from 'react-native';

import { Spacing } from '@/constants/theme';
import { Card } from '@/components/ui/card';
import { Text } from '@/components/ui/text';

export type BookingSummaryCardProps = {
  serviceTitle: string;
  address: string;
  scheduledFor: string;
  notes: string;
};

export function BookingSummaryCard({
  serviceTitle,
  address,
  scheduledFor,
  notes,
}: BookingSummaryCardProps) {
  return (
    <Card style={styles.card}>
      <Row label="Service" value={serviceTitle} />
      <Row label="Address" value={address} />
      <Row label="Date & time" value={new Date(scheduledFor).toLocaleString()} />
      <Row label="Notes" value={notes.trim() ? notes : 'None'} />
    </Card>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text variant="label" color="textSecondary">
        {label}
      </Text>
      <Text variant="body">{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { gap: Spacing.three },
  row: { gap: Spacing.half },
});
