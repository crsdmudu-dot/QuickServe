// trend-card.tsx — Pure presentational KPI tile.
// Shows a title, a large value, an optional trend indicator (▲/▼ + %) and an optional subtitle.
// No SVG needed — all View/Text.

import { View, StyleSheet } from 'react-native';

import { Card } from '@/components/ui/card';
import { Text } from '@/components/ui/text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export type TrendCardProps = {
  /** Card heading, e.g. "Total Revenue" */
  title: string;
  /** The main KPI value. Pass null / '' to display '—'. */
  value: string | number | null;
  /**
   * Optional trend percentage.
   * ≥ 0 → green ▲; < 0 → red ▼ (absolute value shown).
   */
  trendPct?: number;
  /** Optional sub-caption below the value, e.g. "vs last month" */
  subtitle?: string;
  testID?: string;
};

/**
 * TrendCard renders a single KPI metric inside a Card.
 *
 * Layout:
 *   [title]
 *   [large value]
 *   [▲/▼ trendPct%]  (when trendPct is provided)
 *   [subtitle]         (when provided)
 */
export function TrendCard({ title, value, trendPct, subtitle, testID }: TrendCardProps) {
  const theme = useTheme();

  // Null / empty string → display an em-dash.
  const displayValue = value === null || value === '' ? '—' : String(value);

  // Trend indicator.
  const hasTrend = trendPct !== undefined && trendPct !== null;
  const isPositive = hasTrend && (trendPct as number) >= 0;
  const absPercent = hasTrend ? Math.abs(trendPct as number) : 0;
  const trendSymbol = isPositive ? '▲' : '▼';
  const trendColor = isPositive ? theme.success : theme.error;

  return (
    <Card testID={testID} style={styles.card}>
      {/* Title */}
      <Text variant="caption" color="textSecondary" style={styles.title}>
        {title}
      </Text>

      {/* Large value */}
      <Text variant="title" weight="bold" style={styles.value}>
        {displayValue}
      </Text>

      {/* Optional trend */}
      {hasTrend && (
        <View style={styles.trendRow}>
          <Text
            variant="label"
            style={[styles.trend, { color: trendColor }]}
            testID={testID ? `${testID}-trend` : undefined}>
            {trendSymbol} {absPercent}%
          </Text>
        </View>
      )}

      {/* Optional subtitle */}
      {subtitle ? (
        <Text variant="caption" color="textSecondary" style={styles.subtitle}>
          {subtitle}
        </Text>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: Spacing.half,
  },
  title: {
    marginBottom: Spacing.half,
  },
  value: {
    marginTop: Spacing.one,
  },
  trendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: Spacing.half,
  },
  trend: {
    fontVariant: ['tabular-nums'],
  },
  subtitle: {
    marginTop: Spacing.half,
  },
});
