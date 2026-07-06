// booking-progress-tracker.tsx — Horizontal step tracker for booking lifecycle.
// Shows pending → assigned → in_progress → completed with done/current/upcoming states.
// A "cancelled" status renders a distinct cancelled treatment.
// Pure display — no side effects.

import { StyleSheet, View } from 'react-native';

import { Radii, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { Text } from '@/components/ui/text';

// ── Step definitions ───────────────────────────────────────────────────────────

type StepKey = 'pending' | 'assigned' | 'in_progress' | 'completed';

const STEPS: { key: StepKey; label: string }[] = [
  { key: 'pending',     label: 'Pending'     },
  { key: 'assigned',    label: 'Assigned'    },
  { key: 'in_progress', label: 'In Progress' },
  { key: 'completed',   label: 'Completed'   },
];

/**
 * Maps a raw booking status string to one of our 4 display steps.
 * Multiple provider-side statuses map to the same customer-visible step.
 */
function statusToStep(status: string): StepKey | 'cancelled' {
  switch (status) {
    case 'pending':
      return 'pending';
    case 'accepted':
    case 'provider_assigned':
      return 'assigned';
    case 'on_the_way':
    case 'in_progress':
      return 'in_progress';
    case 'completed':
      return 'completed';
    case 'cancelled':
      return 'cancelled';
    default:
      return 'pending';
  }
}

// ── Props ──────────────────────────────────────────────────────────────────────

export type BookingProgressTrackerProps = {
  status: string;
};

// ── Component ──────────────────────────────────────────────────────────────────

export function BookingProgressTracker({ status }: BookingProgressTrackerProps) {
  const theme = useTheme();
  const mappedStep = statusToStep(status);

  // Cancelled treatment
  if (mappedStep === 'cancelled') {
    return (
      <View
        testID="progress-cancelled"
        style={[styles.cancelledBanner, { backgroundColor: theme.errorSurface }]}
      >
        <Text variant="label" color="error" weight="medium">
          Booking Cancelled
        </Text>
        <Text variant="caption" color="textSecondary">
          This booking was cancelled.
        </Text>
      </View>
    );
  }

  const currentIndex = STEPS.findIndex((s) => s.key === mappedStep);

  return (
    <View testID="progress-tracker" style={styles.container}>
      {STEPS.map((step, index) => {
        const isDone    = index < currentIndex;
        const isCurrent = index === currentIndex;
        const isUpcoming = index > currentIndex;

        const dotBg = isDone || isCurrent ? theme.primary : theme.backgroundElement;
        const dotBorderColor = isDone || isCurrent ? theme.primary : theme.border;
        const labelColor = isCurrent ? 'primary' : isUpcoming ? 'textTertiary' : 'success';

        return (
          <View key={step.key} style={styles.stepWrapper}>
            {/* Connector line before this step (except for first) */}
            {index > 0 && (
              <View
                style={[
                  styles.connector,
                  { backgroundColor: index <= currentIndex ? theme.primary : theme.border },
                ]}
              />
            )}

            {/* Dot + label column */}
            <View style={styles.stepColumn}>
              <View
                testID={`step-dot-${step.key}`}
                style={[
                  styles.dot,
                  { backgroundColor: dotBg, borderColor: dotBorderColor },
                ]}
              >
                {isDone && (
                  <Text style={[styles.checkmark, { color: theme.background }]}>✓</Text>
                )}
                {isCurrent && (
                  <View
                    style={[styles.dotInner, { backgroundColor: theme.background }]}
                  />
                )}
              </View>

              <Text
                testID={`step-label-${step.key}`}
                variant="caption"
                color={labelColor}
                weight={isCurrent ? 'semibold' : 'regular'}
                style={styles.label}
              >
                {step.label}
              </Text>
            </View>
          </View>
        );
      })}
    </View>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────────

const DOT_SIZE = 20;

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: Spacing.two,
  },
  stepWrapper: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  connector: {
    flex: 1,
    height: 2,
    marginTop: DOT_SIZE / 2 - 1,
    borderRadius: Radii.pill,
  },
  stepColumn: {
    alignItems: 'center',
    gap: Spacing.one,
  },
  dot: {
    width: DOT_SIZE,
    height: DOT_SIZE,
    borderRadius: Radii.pill,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dotInner: {
    width: 8,
    height: 8,
    borderRadius: Radii.pill,
  },
  checkmark: {
    fontSize: 10,
    lineHeight: 14,
    fontWeight: '700',
  },
  label: {
    textAlign: 'center',
    maxWidth: 64,
  },
  cancelledBanner: {
    borderRadius: Radii.md,
    padding: Spacing.three,
    gap: Spacing.one,
    alignItems: 'center',
  },
});
