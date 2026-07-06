// completeness-card.tsx — Provider profile completeness card.
// Shows a % progress bar, a per-item checklist (done/remaining),
// future-ready items shown muted with a "coming soon" hint,
// and a summary "N tasks remaining" line.
// NO import of @/lib/operations or any private admin tables.

import { StyleSheet, View } from 'react-native';

import { Radii, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { Card } from '@/components/ui/card';
import { Text } from '@/components/ui/text';
import type { CompletenessResult } from '@/lib/provider-completeness';

export type CompletenessCardProps = {
  completeness: CompletenessResult;
};

export function CompletenessCard({ completeness }: CompletenessCardProps) {
  const theme = useTheme();
  const { percent, items, missing } = completeness;
  const remaining = missing.length;

  return (
    <Card>
      {/* ── Header ── */}
      <View style={styles.header}>
        <Text variant="label" weight="semibold">
          Profile completeness
        </Text>
        <Text variant="heading" weight="bold" color="primary">
          {percent}%
        </Text>
      </View>

      {/* ── Progress bar ── */}
      <View style={[styles.barTrack, { backgroundColor: theme.backgroundElement }]}>
        <View
          style={[
            styles.barFill,
            {
              backgroundColor: percent === 100 ? theme.success : theme.primary,
              width: `${percent}%` as any,
            },
          ]}
        />
      </View>

      {/* ── Tasks remaining summary ── */}
      <Text variant="caption" color={remaining === 0 ? 'success' : 'textSecondary'}>
        {remaining === 0
          ? 'All active items complete!'
          : `${remaining} task${remaining === 1 ? '' : 's'} remaining`}
      </Text>

      {/* ── Checklist ── */}
      <View style={styles.checklist}>
        {items.map((item) => {
          if (item.futureReady) {
            // Future-ready items — muted with "coming soon"
            return (
              <View key={item.key} style={styles.row}>
                <Text variant="caption" color="textTertiary" style={styles.checkIcon}>
                  ○
                </Text>
                <Text variant="caption" color="textTertiary" style={styles.itemLabel}>
                  {item.label}
                </Text>
                <Text variant="caption" color="textTertiary" style={styles.comingSoon}>
                  coming soon
                </Text>
              </View>
            );
          }

          return (
            <View key={item.key} style={styles.row}>
              <Text
                variant="caption"
                color={item.done ? 'success' : 'textSecondary'}
                style={styles.checkIcon}>
                {item.done ? '✓' : '○'}
              </Text>
              <Text
                variant="caption"
                color={item.done ? 'text' : 'textSecondary'}
                style={styles.itemLabel}>
                {item.label}
              </Text>
            </View>
          );
        })}
      </View>
    </Card>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.two,
  },
  barTrack: {
    height: 8,
    borderRadius: Radii.pill,
    overflow: 'hidden',
    marginBottom: Spacing.two,
  },
  barFill: {
    height: 8,
    borderRadius: Radii.pill,
  },
  checklist: {
    gap: Spacing.one,
    marginTop: Spacing.two,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  checkIcon: {
    width: 16,
    textAlign: 'center',
  },
  itemLabel: {
    flex: 1,
  },
  comingSoon: {
    fontSize: 10,
    fontStyle: 'italic',
  },
});
