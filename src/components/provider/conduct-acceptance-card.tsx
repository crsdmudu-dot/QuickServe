// conduct-acceptance-card.tsx — Provider code of conduct acceptance card.
// Shows the current conduct version, accepted/not-accepted status (+ date when present),
// and an Accept button that fires onAccept. The SCREEN owns the acceptConduct call.
// NO import of @/lib/operations or any private admin tables.

import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Text } from '@/components/ui/text';

export type ConductAcceptanceCardProps = {
  /** The conduct version string (e.g. "v1"). */
  version: string;
  /** Whether the provider has accepted this version. */
  accepted: boolean;
  /** ISO date string of when the provider accepted, or null/undefined. */
  acceptedAt?: string | null;
  /** Called when the Accept button is pressed. The screen wires this to acceptConduct(version). */
  onAccept: () => void;
  /** When true, shows a spinner and disables the button. */
  submitting?: boolean;
};

export function ConductAcceptanceCard({
  version,
  accepted,
  acceptedAt,
  onAccept,
  submitting = false,
}: ConductAcceptanceCardProps) {
  const theme = useTheme();

  // Format accepted date for display
  const formattedDate = acceptedAt
    ? new Date(acceptedAt).toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      })
    : null;

  return (
    <Card>
      <View style={styles.container}>
        {/* Title */}
        <Text variant="label" weight="semibold">
          Code of Conduct
        </Text>

        {/* Version */}
        <Text variant="caption" color="textSecondary">
          Version: {version}
        </Text>

        {/* Accepted / not accepted status */}
        {accepted ? (
          <View style={styles.acceptedRow}>
            <Text variant="caption" color="success">
              ✓ Accepted
            </Text>
            {formattedDate != null && (
              <Text variant="caption" color="textTertiary">
                on {formattedDate}
              </Text>
            )}
          </View>
        ) : (
          <View style={styles.notAcceptedSection}>
            <Text variant="caption" color="warning">
              Not yet accepted
            </Text>
            <Text variant="caption" color="textSecondary">
              Please read and accept the provider code of conduct to continue
              working on the platform.
            </Text>

            {/* Accept button */}
            <View style={styles.buttonRow}>
              {submitting && (
                <ActivityIndicator
                  size="small"
                  color={theme.primary}
                  testID="conduct-spinner"
                />
              )}
              <Button
                label="Accept"
                onPress={onAccept}
                disabled={accepted || submitting}
                loading={submitting}
                variant="primary"
              />
            </View>
          </View>
        )}
      </View>
    </Card>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    gap: Spacing.two,
  },
  acceptedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  notAcceptedSection: {
    gap: Spacing.two,
  },
  buttonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
});
