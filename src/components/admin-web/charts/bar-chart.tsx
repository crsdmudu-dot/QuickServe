// bar-chart.tsx — Vertical bar chart using react-native-svg.
// Pure presentational: accepts data + optional format fn; no business logic / fetching.
// Responsive: measures container width via onLayout and renders the Svg at that width.
// Tooltip-ready: computes per-bar geometry (x, y, barWidth, barHeight) but does NOT
// implement a tooltip — a future caller can consume the barGeometry via onBarGeometry.

import { useState } from 'react';
import { View, StyleSheet } from 'react-native';
import Svg, { Rect, Text as SvgText, Line } from 'react-native-svg';

import { Text } from '@/components/ui/text';
import { Skeleton } from '@/components/ui/skeleton';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

// ─── Types ─────────────────────────────────────────────────────────────────

export type BarDatum = {
  label: string;
  value: number;
};

/** Geometry for a single bar — exposed so future tooltip callers can position themselves. */
export type BarGeometry = {
  label: string;
  value: number;
  x: number;
  y: number;
  barWidth: number;
  barHeight: number;
};

export type BarChartProps = {
  data: BarDatum[];
  /** Height of the SVG canvas in px. Default: 220. */
  height?: number;
  /** Optional formatter for the value label shown above each bar. */
  format?: (n: number) => string;
  loading?: boolean;
  testID?: string;
  /** Optional callback that receives per-bar geometry after each render. */
  onBarGeometry?: (geometry: BarGeometry[]) => void;
};

// ─── Constants ──────────────────────────────────────────────────────────────

const DEFAULT_WIDTH = 320;
const DEFAULT_HEIGHT = 220;
const PADDING_TOP = 24;       // Space for the value label above the tallest bar
const PADDING_BOTTOM = 36;    // Space for the x-axis label below each bar
const PADDING_SIDE = 8;       // Left/right edge padding

// ─── Component ──────────────────────────────────────────────────────────────

/**
 * BarChart renders vertical bars sized relative to the maximum value.
 *
 * Layout (inside the Svg canvas):
 *   - Each bar fills (availableWidth / n) with small gaps.
 *   - A value label sits above each bar.
 *   - A text label sits below each bar (x axis).
 *   - A baseline is drawn across the bottom.
 */
export function BarChart({
  data,
  height = DEFAULT_HEIGHT,
  format,
  loading = false,
  testID,
  onBarGeometry,
}: BarChartProps) {
  const theme = useTheme();
  const [containerWidth, setContainerWidth] = useState(DEFAULT_WIDTH);

  // ── Loading state ────────────────────────────────────────────────────────
  if (loading) {
    return (
      <View testID="chart-loading">
        <Skeleton width="100%" height={height} />
      </View>
    );
  }

  // ── Empty state ──────────────────────────────────────────────────────────
  if (!data || data.length === 0) {
    return (
      <View testID="chart-empty" style={styles.emptyContainer}>
        <Text variant="caption" color="textSecondary">
          No data
        </Text>
      </View>
    );
  }

  // ── Geometry calculations ────────────────────────────────────────────────
  const svgWidth = containerWidth;
  const plotWidth = svgWidth - PADDING_SIDE * 2;
  const plotHeight = height - PADDING_TOP - PADDING_BOTTOM;

  const maxValue = Math.max(...data.map((d) => d.value));
  // Guard: if all values are 0, treat max as 1 to avoid division by zero.
  const safeMax = maxValue === 0 ? 1 : maxValue;

  const totalBars = data.length;
  const barSlotWidth = plotWidth / totalBars;
  const barWidth = Math.max(barSlotWidth * 0.6, 4); // 60% of slot, min 4px
  const barGap = barSlotWidth - barWidth;

  const geometry: BarGeometry[] = data.map((d, i) => {
    const barHeight = (d.value / safeMax) * plotHeight;
    const x = PADDING_SIDE + i * barSlotWidth + barGap / 2;
    const y = PADDING_TOP + (plotHeight - barHeight);
    return { label: d.label, value: d.value, x, y, barWidth, barHeight };
  });

  // Notify caller of geometry (for future tooltip support).
  if (onBarGeometry) {
    // Use a microtask to avoid calling during render.
    Promise.resolve().then(() => onBarGeometry(geometry));
  }

  const baselineY = PADDING_TOP + plotHeight;
  const labelY = baselineY + 4; // Slightly below the baseline

  return (
    <View
      testID={testID}
      onLayout={(e) => setContainerWidth(e.nativeEvent.layout.width || DEFAULT_WIDTH)}>
      <Svg width={svgWidth} height={height}>
        {/* Baseline */}
        <Line
          x1={PADDING_SIDE}
          y1={baselineY}
          x2={svgWidth - PADDING_SIDE}
          y2={baselineY}
          stroke={theme.border}
          strokeWidth={1}
        />

        {geometry.map((g, i) => {
          const valueLabelY = g.y - 4; // 4px above the bar top
          const displayValue = format ? format(g.value) : String(g.value);
          const labelCenterX = g.x + g.barWidth / 2;

          return (
            <React.Fragment key={i}>
              {/* Bar rectangle */}
              <Rect
                x={g.x}
                y={g.y}
                width={g.barWidth}
                height={g.barHeight}
                rx={3}
                fill={theme.primary}
              />

              {/* Value label above bar */}
              <SvgText
                x={labelCenterX}
                y={valueLabelY}
                fontSize={10}
                fill={theme.textSecondary}
                textAnchor="middle">
                {displayValue}
              </SvgText>

              {/* x-axis label below bar */}
              <SvgText
                x={labelCenterX}
                y={labelY + 14}
                fontSize={10}
                fill={theme.textSecondary}
                textAnchor="middle">
                {g.label}
              </SvgText>
            </React.Fragment>
          );
        })}
      </Svg>
    </View>
  );
}

// React import needed for React.Fragment in JSX.
import React from 'react';

const styles = StyleSheet.create({
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.four,
  },
});
