// safety-tips-card.tsx — Displays SAFETY_REMINDERS and CUSTOMER_TIPS (static).
// Pure display — no side effects.

import { StyleSheet, View } from 'react-native';

import { Radii, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { SAFETY_REMINDERS, CUSTOMER_TIPS } from '@/constants/trust';
import { Card } from '@/components/ui/card';
import { Text } from '@/components/ui/text';
import { SectionHeader } from '@/components/ui/section-header';

// ── Component ──────────────────────────────────────────────────────────────────

export function SafetyTipsCard() {
  return (
    <View style={styles.container}>
      {/* ── Safety Reminders ── */}
      <SectionHeader title="Safety reminders" />
      <Card elevation="e1">
        <TipList items={SAFETY_REMINDERS} icon="🛡️" />
      </Card>

      {/* ── Customer Tips ── */}
      <SectionHeader title="Tips for a great experience" />
      <Card elevation="e1">
        <TipList items={CUSTOMER_TIPS} icon="💡" />
      </Card>
    </View>
  );
}

// ── TipList sub-component ─────────────────────────────────────────────────────

type TipItem = { title: string; body: string };

function TipList({ items, icon }: { items: TipItem[]; icon: string }) {
  const theme = useTheme();

  return (
    <View style={styles.tipList}>
      {items.map((item, index) => (
        <View key={index} style={styles.tipRow}>
          {/* Icon badge */}
          <View
            style={[styles.tipIconBadge, { backgroundColor: theme.primarySurface }]}
          >
            <Text style={styles.tipIcon}>{icon}</Text>
          </View>

          {/* Content */}
          <View style={styles.tipContent}>
            <Text variant="label" weight="semibold">
              {item.title}
            </Text>
            <Text variant="caption" color="textSecondary">
              {item.body}
            </Text>
          </View>
        </View>
      ))}
    </View>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    gap: Spacing.two,
  },
  tipList: {
    gap: Spacing.three,
  },
  tipRow: {
    flexDirection: 'row',
    gap: Spacing.three,
    alignItems: 'flex-start',
  },
  tipIconBadge: {
    width: 36,
    height: 36,
    borderRadius: Radii.md,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  tipIcon: {
    fontSize: 16,
    lineHeight: 20,
  },
  tipContent: {
    flex: 1,
    gap: Spacing.one,
  },
});
