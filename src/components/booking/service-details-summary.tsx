/**
 * service-details-summary.tsx — THE shared, read-only Service Details renderer (V1.4).
 *
 * One component renders a booking's stored Service Details on every post-booking surface:
 * Review, Customer Booking Detail, Provider Job Detail and both Admin booking views. There is no
 * per-surface rendering logic — a surface only chooses its `audience` and how a booking with no
 * details should read.
 *
 * It renders EXCLUSIVELY from the snapshot (via toServiceDetailsView), never from the current
 * SERVICE_FORMS configuration, so a booking always reads the way the customer submitted it even
 * after the question set is rewritten. It is display-only: no inputs, no actions, no writes — the
 * snapshot is immutable after booking creation (enforced in the database by migration 0038).
 */

import { StyleSheet, View } from 'react-native';

import { Spacing } from '@/constants/theme';
import { Card } from '@/components/ui/card';
import { Text } from '@/components/ui/text';
import { toServiceDetailsView, type ServiceDetailRow } from '@/lib/service-details-view';

/**
 * Who is reading. Only affects OPERATIONAL flags, never the customer's answers:
 *  - `customer` — the request only. Safety wording belongs to the booking flow, not to a
 *    post-booking receipt-style summary, so no flags are repeated here.
 *  - `provider`  — adds the dispatch-priority flag, which changes how the job is approached.
 *  - `admin`     — adds the priority flag and the customer's safety acknowledgement.
 */
export type ServiceDetailsAudience = 'customer' | 'provider' | 'admin';

export type ServiceDetailsSummaryProps = {
  /**
   * Raw `bookings.service_details`. Deliberately `unknown`: the database may hold a snapshot
   * written by a newer app version, or null for a booking that predates Service Details.
   */
  details: unknown;
  audience?: ServiceDetailsAudience;
  /**
   * Shown when the booking has no readable details. Pass `null` to render nothing at all — the
   * right choice on customer surfaces, where an absent section is quieter than an apology.
   */
  emptyText?: string | null;
  testID?: string;
};

const DEFAULT_EMPTY_TEXT = 'Service details were not captured for this booking.';

/** One label-above-value pair — the single visual unit this summary is built from. */
function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text variant="caption" color="textSecondary">
        {label}
      </Text>
      <Text variant="body">{value}</Text>
    </View>
  );
}

function Rows({ rows }: { rows: ServiceDetailRow[] }) {
  return (
    <>
      {rows.map((row) => (
        <DetailRow key={row.id} label={row.label} value={row.value} />
      ))}
    </>
  );
}

export function ServiceDetailsSummary({
  details,
  audience = 'customer',
  emptyText = DEFAULT_EMPTY_TEXT,
  testID = 'service-details-summary',
}: ServiceDetailsSummaryProps) {
  const view = toServiceDetailsView(details);

  // Legacy (null), malformed, or nothing renderable — never a crash, never raw data.
  if (!view) {
    if (emptyText === null) return null;
    return (
      <Card testID={`${testID}-empty`}>
        <Text variant="caption" color="textSecondary">
          {emptyText}
        </Text>
      </Card>
    );
  }

  const { primary, answers, addons, items, flags } = view;
  // Priority matters to whoever is doing the job; the acknowledgement is an audit detail.
  const showPriority = flags.priority && audience !== 'customer';
  const showSafetyAck = flags.safetyAck && audience === 'admin';

  return (
    <Card testID={testID}>
      <View style={styles.content}>
        {primary ? <DetailRow label={primary.label} value={primary.value} /> : null}

        <Rows rows={answers} />

        {addons.length > 0 ? (
          <View style={styles.row}>
            <Text variant="caption" color="textSecondary">
              Add-ons
            </Text>
            {addons.map((addon) => (
              <Text key={addon} variant="body">
                {`• ${addon}`}
              </Text>
            ))}
          </View>
        ) : null}

        {items && items.lines.length > 0 ? (
          <View style={styles.row}>
            <Text variant="caption" color="textSecondary">
              Requested items
            </Text>
            {items.lines.map((line) => (
              <View key={line.id} style={styles.item}>
                <Text variant="body" weight="semibold">
                  {line.name}
                </Text>
                {line.quantity ? (
                  <Text variant="body" color="textSecondary">
                    {line.quantity}
                  </Text>
                ) : null}
                {line.brand ? (
                  <Text variant="caption" color="textSecondary">
                    {`Brand: ${line.brand}`}
                  </Text>
                ) : null}
                {line.note ? (
                  <Text variant="caption" color="textSecondary">
                    {line.note}
                  </Text>
                ) : null}
              </View>
            ))}
          </View>
        ) : null}

        {items?.goodsBudget ? (
          <View style={styles.row}>
            <Text variant="caption" color="textSecondary">
              Maximum goods budget
            </Text>
            <Text variant="body">{items.goodsBudget}</Text>
            {/* Keeps the ceiling from reading as a price: it caps the GOODS only. */}
            <Text variant="caption" color="textTertiary">
              The most we may spend buying the items. Delivery and service fees are separate.
            </Text>
          </View>
        ) : null}

        {items?.substitution ? <DetailRow label="Substitutions" value={items.substitution} /> : null}

        {showPriority ? (
          <View style={styles.row} testID={`${testID}-priority`}>
            <Text variant="body" weight="semibold" color="warning">
              Priority attention
            </Text>
          </View>
        ) : null}

        {showSafetyAck ? (
          <Text variant="caption" color="textTertiary">
            Customer acknowledged the safety notice.
          </Text>
        ) : null}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  content: { gap: Spacing.three },
  row: { gap: Spacing.half },
  item: { gap: Spacing.half, marginTop: Spacing.two },
});
