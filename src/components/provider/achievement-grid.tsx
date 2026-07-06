// achievement-grid.tsx — Grid of provider achievement tiles.
// Earned tiles are full-color; locked/unearned tiles are muted.
// Progress bars are shown when a `progress` value is present.
// NO import of @/lib/operations or any private admin tables.

import { StyleSheet, View } from 'react-native';

import { Radii, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { Text } from '@/components/ui/text';
import type { ProviderAchievement } from '@/lib/provider-achievements';

export type AchievementGridProps = {
  achievements: ProviderAchievement[];
};

export function AchievementGrid({ achievements }: AchievementGridProps) {
  const theme = useTheme();

  if (achievements.length === 0) {
    return (
      <Text variant="caption" color="textSecondary">
        No achievements yet — complete your first job to get started!
      </Text>
    );
  }

  return (
    <View style={styles.grid}>
      {achievements.map((achievement) => {
        const earned = achievement.earned;
        return (
          <View
            key={achievement.key}
            style={[
              styles.tile,
              {
                backgroundColor: earned ? theme.primarySurface : theme.surfaceMuted,
                borderColor: earned ? theme.primary : theme.border,
              },
            ]}>
            {/* Icon */}
            <Text style={[styles.icon, !earned && styles.iconLocked]}>
              {achievement.icon}
            </Text>

            {/* Label */}
            <Text
              variant="caption"
              color={earned ? 'primary' : 'textTertiary'}
              style={styles.label}>
              {achievement.label}
            </Text>

            {/* Progress bar (when present) */}
            {achievement.progress != null && (
              <View style={styles.progressSection}>
                <View
                  style={[styles.barTrack, { backgroundColor: theme.backgroundElement }]}>
                  <View
                    style={[
                      styles.barFill,
                      {
                        backgroundColor: earned ? theme.primary : theme.neutral400,
                        width: `${Math.min(100, (achievement.progress.current / achievement.progress.target) * 100)}%` as any,
                      },
                    ]}
                  />
                </View>
                <Text variant="caption" color="textTertiary" style={styles.progressText}>
                  {achievement.progress.current}/{achievement.progress.target}
                </Text>
              </View>
            )}

            {/* Locked hint */}
            {!earned && (
              <Text variant="caption" color="textTertiary" style={styles.lockedHint}>
                Locked
              </Text>
            )}
          </View>
        );
      })}
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  tile: {
    width: 100,
    borderRadius: Radii.lg,
    borderWidth: 1,
    padding: Spacing.two,
    alignItems: 'center',
    gap: Spacing.one,
  },
  icon: {
    fontSize: 28,
  },
  iconLocked: {
    opacity: 0.35,
  },
  label: {
    textAlign: 'center',
  },
  progressSection: {
    width: '100%',
    gap: 2,
    alignItems: 'center',
  },
  barTrack: {
    width: '100%',
    height: 4,
    borderRadius: Radii.pill,
    overflow: 'hidden',
  },
  barFill: {
    height: 4,
    borderRadius: Radii.pill,
  },
  progressText: {
    fontSize: 10,
  },
  lockedHint: {
    fontSize: 10,
    opacity: 0.6,
  },
});
