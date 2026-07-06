// service-guarantees-card.tsx — Displays SERVICE_GUARANTEES (static).
// Pure display — no side effects.

import { StyleSheet, View } from 'react-native';

import { Radii, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { SERVICE_GUARANTEES } from '@/constants/trust';
import { Card } from '@/components/ui/card';
import { Text } from '@/components/ui/text';
import { SectionHeader } from '@/components/ui/section-header';

// ── Component ──────────────────────────────────────────────────────────────────

export function ServiceGuaranteesCard() {
  const theme = useTheme();

  return (
    <View style={styles.container}>
      <SectionHeader title="Our guarantees" />
      <Card elevation="e1">
        <View style={styles.list}>
          {SERVICE_GUARANTEES.map((guarantee, index) => (
            <View key={index} style={styles.guaranteeRow}>
              {/* Shield icon badge */}
              <View
                style={[styles.iconBadge, { backgroundColor: theme.primarySurface }]}
              >
                <Text style={styles.icon}>✅</Text>
              </View>

              {/* Content */}
              <View style={styles.content}>
                <Text variant="label" weight="semibold">
                  {guarantee.title}
                </Text>
                <Text variant="caption" color="textSecondary">
                  {guarantee.body}
                </Text>
              </View>
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
  list: {
    gap: Spacing.three,
  },
  guaranteeRow: {
    flexDirection: 'row',
    gap: Spacing.three,
    alignItems: 'flex-start',
  },
  iconBadge: {
    width: 36,
    height: 36,
    borderRadius: Radii.md,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  icon: {
    fontSize: 16,
    lineHeight: 20,
  },
  content: {
    flex: 1,
    gap: Spacing.one,
  },
});
