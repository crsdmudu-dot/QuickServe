// profile-completion-card.tsx — Shows customer profile completion %.
// Renders a progress bar and a checklist of items (done ✓ / remaining).
// Future-ready items (features that do not exist yet) are NOT shown: a submitted app
// must not advertise "coming soon" features (App Store 2.1).
// Pure display — accepts the output of computeCustomerProfileCompletion.

import { StyleSheet, View } from 'react-native';

import { Radii, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { type computeCustomerProfileCompletion } from '@/constants/customer-profile';
import { Card } from '@/components/ui/card';
import { Text } from '@/components/ui/text';
import { SectionHeader } from '@/components/ui/section-header';

// ── Props ──────────────────────────────────────────────────────────────────────

export type ProfileCompletionCardProps = {
  completion: ReturnType<typeof computeCustomerProfileCompletion>;
};

// ── Component ──────────────────────────────────────────────────────────────────

export function ProfileCompletionCard({ completion }: ProfileCompletionCardProps) {
  const theme = useTheme();
  const { percent, items, missing } = completion;

  const remainingCount = missing.length;

  return (
    <View style={styles.container}>
      <SectionHeader title="Profile completeness" />
      <Card elevation="e1">
        {/* ── Percentage + label ── */}
        <View style={styles.percentRow}>
          <Text variant="title" weight="bold" color="primary">
            {percent}%
          </Text>
          <Text variant="caption" color="textSecondary">
            {remainingCount === 0
              ? 'Profile complete!'
              : `${remainingCount} task${remainingCount === 1 ? '' : 's'} remaining`}
          </Text>
        </View>

        {/* ── Progress bar ── */}
        <View
          testID="progress-bar-track"
          style={[styles.barTrack, { backgroundColor: theme.backgroundElement }]}
        >
          <View
            testID="progress-bar-fill"
            style={[
              styles.barFill,
              {
                backgroundColor: theme.primary,
                width: `${percent}%` as any,
              },
            ]}
          />
        </View>

        {/* ── Checklist (only items the app supports today) ── */}
        <View style={styles.checklist}>
          {items
            .filter((item) => item.futureReady !== true)
            .map((item) => (
              <View key={item.key} style={styles.checkRow}>
                {/* Status indicator */}
                <Text
                  variant="caption"
                  color={item.done ? 'success' : 'textSecondary'}
                  style={styles.checkIcon}
                >
                  {item.done ? '✓' : '○'}
                </Text>

                {/* Item label */}
                <Text
                  variant="caption"
                  color={item.done ? 'textSecondary' : 'text'}
                  style={styles.checkLabel}
                >
                  {item.label}
                </Text>
              </View>
            ))}
        </View>
      </Card>
    </View>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    gap: Spacing.two,
  },
  percentRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: Spacing.two,
    marginBottom: Spacing.two,
  },
  barTrack: {
    height: 8,
    borderRadius: Radii.pill,
    overflow: 'hidden',
    marginBottom: Spacing.three,
  },
  barFill: {
    height: 8,
    borderRadius: Radii.pill,
  },
  checklist: {
    gap: Spacing.two,
  },
  checkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  checkIcon: {
    width: 16,
    textAlign: 'center',
  },
  checkLabel: {
    flex: 1,
  },
});
