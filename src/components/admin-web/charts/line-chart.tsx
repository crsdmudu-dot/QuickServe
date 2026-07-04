// line-chart.tsx — Line chart using react-native-svg.
// Pure presentational: accepts a series array + optional format fn; no business logic.
// Responsive: measures container width via onLayout.
// Future-ready: the internal renderLine(points, color) helper makes adding multiple
// series trivial (just call it once per series in a future props extension).

import React, { useState } from 'react';
import { View, StyleSheet } from 'react-native';
import Svg, { Polyline, Line, Text as SvgText } from 'react-native-svg';

import { Text } from '@/components/ui/text';
import { Skeleton } from '@/components/ui/skeleton';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

// ─── Types ─────────────────────────────────────────────────────────────────

export type SeriesPoint = {
  label: string;
  value: number;
};

export type LineChartProps = {
  series: SeriesPoint[];
  /** Height of the SVG canvas in px. Default: 200. */
  height?: number;
  /** Optional formatter for the y-axis / tooltip values. */
  format?: (n: number) => string;
  loading?: boolean;
  testID?: string;
};

// ─── Constants ──────────────────────────────────────────────────────────────

const DEFAULT_WIDTH = 320;
const DEFAULT_HEIGHT = 200;
const PADDING_TOP = 16;
const PADDING_BOTTOM = 32; // Room for x-axis labels
const PADDING_LEFT = 40;   // Room for y-axis
const PADDING_RIGHT = 8;

// How many x-axis labels to show (first + last + sampled middle ones).
const MAX_LABELS = 5;

// ─── Component ──────────────────────────────────────────────────────────────

/**
 * LineChart renders a single-series line chart.
 *
 * Internal architecture is designed for future multi-series support:
 * - mapToPoints(series, ...) converts data → SVG pixel coords.
 * - renderLine(points, color) renders a Polyline from those coords.
 * Adding a second series only requires calling mapToPoints + renderLine again.
 */
export function LineChart({
  series,
  height = DEFAULT_HEIGHT,
  format,
  loading = false,
  testID,
}: LineChartProps) {
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
  if (!series || series.length === 0) {
    return (
      <View testID="chart-empty" style={styles.emptyContainer}>
        <Text variant="caption" color="textSecondary">
          No data
        </Text>
      </View>
    );
  }

  // ── Geometry helpers ─────────────────────────────────────────────────────
  const svgWidth = containerWidth;
  const plotWidth = svgWidth - PADDING_LEFT - PADDING_RIGHT;
  const plotHeight = height - PADDING_TOP - PADDING_BOTTOM;

  const values = series.map((s) => s.value);
  const minValue = Math.min(...values);
  const maxValue = Math.max(...values);
  // Guard: flat line → avoid division by zero by giving a 10% headroom range.
  const range = maxValue === minValue ? Math.max(maxValue * 0.1, 1) : maxValue - minValue;
  const dataMin = maxValue === minValue ? minValue - range / 2 : minValue;

  /**
   * Convert a series array to pixel [x, y] coords inside the plot area.
   * Future callers can pass any series (different colour) and get points back.
   */
  function mapToPoints(pts: SeriesPoint[]): Array<[number, number]> {
    return pts.map((pt, i) => {
      const xFraction = pts.length === 1 ? 0.5 : i / (pts.length - 1);
      const x = PADDING_LEFT + xFraction * plotWidth;
      const yFraction = (pt.value - dataMin) / range;
      const y = PADDING_TOP + plotHeight - yFraction * plotHeight;
      return [x, y];
    });
  }

  /**
   * Render a <Polyline> for a given set of pixel points + stroke color.
   * Internal helper — extracted so adding a second series is a one-liner.
   */
  function renderLine(points: Array<[number, number]>, color: string) {
    const pointsStr = points.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
    return (
      <Polyline
        points={pointsStr}
        fill="none"
        stroke={color}
        strokeWidth={2.5}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    );
  }

  const points = mapToPoints(series);

  // ── x-axis label sampling ─────────────────────────────────────────────────
  // Show at most MAX_LABELS labels: always first + last, sampled in between.
  function getSampledIndices(n: number, max: number): number[] {
    if (n <= max) return Array.from({ length: n }, (_, i) => i);
    const step = (n - 1) / (max - 1);
    return Array.from({ length: max }, (_, i) => Math.round(i * step));
  }

  const labelIndices = new Set(getSampledIndices(series.length, MAX_LABELS));
  const baselineY = PADDING_TOP + plotHeight;
  const leftAxisX = PADDING_LEFT;

  return (
    <View
      testID={testID}
      onLayout={(e) => setContainerWidth(e.nativeEvent.layout.width || DEFAULT_WIDTH)}>
      <Svg width={svgWidth} height={height}>
        {/* Left axis line */}
        <Line
          x1={leftAxisX}
          y1={PADDING_TOP}
          x2={leftAxisX}
          y2={baselineY}
          stroke={theme.border}
          strokeWidth={1}
        />

        {/* Baseline */}
        <Line
          x1={leftAxisX}
          y1={baselineY}
          x2={svgWidth - PADDING_RIGHT}
          y2={baselineY}
          stroke={theme.border}
          strokeWidth={1}
        />

        {/* The line itself */}
        {renderLine(points, theme.primary)}

        {/* Dot at each data point */}
        {points.map(([x, y], i) => (
          <React.Fragment key={i}>
            {/* SVG Circle replacement using a small square for simplicity */}
            <Polyline
              points={`${x - 3},${y} ${x + 3},${y}`}
              stroke={theme.primary}
              strokeWidth={2}
            />
          </React.Fragment>
        ))}

        {/* x-axis labels */}
        {series.map((pt, i) => {
          if (!labelIndices.has(i)) return null;
          const [x] = points[i];
          return (
            <SvgText
              key={i}
              x={x}
              y={baselineY + 16}
              fontSize={9}
              fill={theme.textSecondary}
              textAnchor="middle">
              {pt.label}
            </SvgText>
          );
        })}
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.four,
  },
});
