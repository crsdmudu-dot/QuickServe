/**
 * CancellationCard — Update 74: who cancelled a cancelled booking, and what the cancellation did.
 *
 * Reads public.booking_cancellations (one row per customer cancellation; active admins can read every
 * row). A cancelled booking with no row was cancelled by KwikServe from this admin web. Labels are DRAFT
 * operator texts (74 50-WORDING-PROPOSALS.md §1.9).
 */
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { STATUS_LABELS, type BookingStatus } from '@/constants/booking-status';
import { CANCEL_REASON_LABELS } from '@/constants/cancellation-copy';
import { Spacing } from '@/constants/theme';
import { getBookingCancellation, type BookingCancellation } from '@/lib/cancellation';
import { Card } from '@/components/ui/card';
import { SectionHeader } from '@/components/ui/section-header';
import { Text } from '@/components/ui/text';

function reasonLabel(code: string | null): string {
  if (!code) return 'not given';
  return (CANCEL_REASON_LABELS as Record<string, string>)[code] ?? code;
}

export function CancellationCard({ bookingId }: { bookingId: string }) {
  const [state, setState] = useState<{ loaded: boolean; row: BookingCancellation | null }>({ loaded: false, row: null });

  useEffect(() => {
    let active = true;
    getBookingCancellation(bookingId).then((row) => {
      if (active) setState({ loaded: true, row });
    });
    return () => {
      active = false;
    };
  }, [bookingId]);

  if (!state.loaded) return null;
  const row = state.row;
  return (
    <View testID="admin-cancellation-card">
      <SectionHeader title="Cancellation" />
      <Card>
        <View style={styles.body}>
          {row ? (
            <>
              <Text variant="body" weight="semibold">
                Cancelled by the customer in the app
              </Text>
              <Text variant="caption" color="textSecondary">
                {new Date(row.cancelled_at).toLocaleString()}
              </Text>
              <Text variant="body">{`Was: ${STATUS_LABELS[row.from_status as BookingStatus] ?? row.from_status}`}</Text>
              <Text variant="body">{`Reason: ${reasonLabel(row.reason_code)}`}</Text>
              <Text variant="body">
                {`Provider: ${row.provider_id ? 'told in the app' : row.manual_provider ? 'arranged by phone: phone them to tell them' : 'none assigned'}`}
              </Text>
              <Text variant="body">
                {`Payment: ${row.payment_status_before === 'pending' ? 'request cancelled' : row.payment_id ? 'already cancelled' : 'none'}`}
              </Text>
              <Text variant="body">{`Location cleared: ${row.location_cleared ? 'yes' : 'no'}`}</Text>
            </>
          ) : (
            <Text variant="body" weight="semibold">
              Cancelled by KwikServe (admin)
            </Text>
          )}
        </View>
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  body: { gap: Spacing.one, padding: Spacing.three },
});
