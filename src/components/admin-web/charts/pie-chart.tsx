// pie-chart.tsx — Donut/pie chart using react-native-svg.
// Pure presentational: accepts slices array; no business logic.
// Responsive: centers the Svg within the container.
// Renders SVG arc paths for each slice + a legend with label, swatch, and percentage.

import React, { useState } from 'react';
import { View, StyleSheet } from 'react-native';
import Svg, { Path, G, Text as SvgText } from 'react-native-svg';

import { Text } from '@/components/ui/text';
import { Skeleton } from '@/components/ui/skeleton';
import { Spacing, Radii } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

// ─── Types ─────────────────────────────────────────────────────────────────

export type PieSlice = {
  label: string;
  value: number;
};

export type PieChartProps = {
  slices: PieSlice[];
  /** Diameter of the svg donut in px. Default: 180. */
  size?: number;
  loading?: boolean;
  testID?: string;
};

// ─── Palette ────────────────────────────────────────────────────────────────
// A small set of theme-inspired hues that cycle for multiple slices.

const SLICE_COLORS = [
  '#00875A', // primary green
  '#0EA5E9', // info blue
  '#F5A524', // warning amber
  '#E5484D', // error red
  '#8B5CF6', // purple
  '#EC4899', // pink
  '#14B8A6', // teal
  '#F97316', // orange
];

function getSliceColor(index: number): string {
  return SLICE_COLORS[index % SLICE_COLORS.length];
}

// ─── Arc helpers ─────────────────────────────────────────────────────────────

/**
 * Compute the SVG arc path for a donut slice.
 *
 * @param cx       Center x of the donut
 * @param cy       Center y of the donut
 * @param outerR   Outer radius
 * @param innerR   Inner radius (the donut hole)
 * @param startAngle  Start angle in radians (0 = top)
 * @param endAngle    End angle in radians
 */
function describeArc(
  cx: number,
  cy: number,
  outerR: number,
  innerR: number,
  startAngle: number,
  endAngle: number,
): string {
  // Convert from "start at top" to standard math angles.
  const toX = (r: number, angle: number) => cx + r * Math.sin(angle);
  const toY = (r: number, angle: number) => cy - r * Math.cos(angle);

  const largeArc = endAngle - startAngle > Math.PI ? 1 : 0;

  const x1 = toX(outerR, startAngle);
  const y1 = toY(outerR, startAngle);
  const x2 = toX(outerR, endAngle);
  const y2 = toY(outerR, endAngle);
  const x3 = toX(innerR, endAngle);
  const y3 = toY(innerR, endAngle);
  const x4 = toX(innerR, startAngle);
  const y4 = toY(innerR, startAngle);

  return [
    `M ${x1} ${y1}`,
    `A ${outerR} ${outerR} 0 ${largeArc} 1 ${x2} ${y2}`,
    `L ${x3} ${y3}`,
    `A ${innerR} ${innerR} 0 ${largeArc} 0 ${x4} ${y4}`,
    'Z',
  ].join(' ');
}

/**
 * Compute the midpoint angle for a slice (used for the percentage label).
 */
function midAngle(startAngle: number, endAngle: number): number {
  return (startAngle + endAngle) / 2;
}

// ─── Component ──────────────────────────────────────────────────────────────

/**
 * PieChart renders a donut chart with a legend.
 *
 * Legend: label (text) + color swatch + percentage, one row per slice.
 * Percentage labels: rendered inside each arc at the midpoint.
 */
export function PieChart({ slices, size = 180, loading = false, testID }: PieChartProps) {
  const theme = useTheme();

  // ── Loading state ────────────────────────────────────────────────────────
  if (loading) {
    return (
      <View testID="chart-loading" style={styles.loadingContainer}>
        <Skeleton width={size} height={size} radius={size / 2} />
        <Skeleton width="60%" height={12} />
      </View>
    );
  }

  // ── Empty state ──────────────────────────────────────────────────────────
  if (!slices || slices.length === 0) {
    return (
      <View testID="chart-empty" style={styles.emptyContainer}>
        <Text variant="caption" color="textSecondary">
          No data
        </Text>
      </View>
    );
  }

  const total = slices.reduce((sum, s) => sum + s.value, 0);

  // Guard: if all values are 0 → empty state.
  if (total === 0) {
    return (
      <View testID="chart-empty" style={styles.emptyContainer}>
        <Text variant="caption" color="textSecondary">
          No data
        </Text>
      </View>
    );
  }

  // ── Arc geometry ─────────────────────────────────────────────────────────
  const cx = size / 2;
  const cy = size / 2;
  const outerR = size / 2 - 4; // Small gap from edge
  const innerR = outerR * 0.55; // Donut hole: 55% of outer radius
  const labelR = outerR * 0.78; // Radius for percentage text labels

  // Build cumulative angles.
  type SliceGeometry = {
    label: string;
    value: number;
    pct: number;
    color: string;
    startAngle: number;
    endAngle: number;
    path: string;
    midAngleRad: number;
  };

  let currentAngle = 0;
  const sliceGeometry: SliceGeometry[] = slices.map((s, i) => {
    const fraction = s.value / total;
    const sweep = fraction * 2 * Math.PI;
    const startAngle = currentAngle;
    const endAngle = currentAngle + sweep;
    currentAngle = endAngle;

    const color = getSliceColor(i);
    const pct = Math.round(fraction * 100);

    return {
      label: s.label,
      value: s.value,
      pct,
      color,
      startAngle,
      endAngle,
      path: describeArc(cx, cy, outerR, innerR, startAngle, endAngle),
      midAngleRad: midAngle(startAngle, endAngle),
    };
  });

  return (
    <View testID={testID} style={styles.container}>
      {/* Donut SVG */}
      <Svg width={size} height={size}>
        <G>
          {sliceGeometry.map((sg, i) => (
            <React.Fragment key={i}>
              {/* Slice arc */}
              <Path d={sg.path} fill={sg.color} />

              {/* Percentage label inside the arc — only render if slice is large enough */}
              {sg.pct >= 8 && (
                <SvgText
                  x={cx + labelR * Math.sin(sg.midAngleRad)}
                  y={cy - labelR * Math.cos(sg.midAngleRad) + 4}
                  fontSize={10}
                  fill="#FFFFFF"
                  textAnchor="middle"
                  fontWeight="600">
                  {sg.pct}%
                </SvgText>
              )}
            </React.Fragment>
          ))}
        </G>
      </Svg>

      {/* Legend */}
      <View style={styles.legend}>
        {sliceGeometry.map((sg, i) => (
          <View key={i} style={styles.legendRow}>
            {/* Color swatch */}
            <View style={[styles.swatch, { backgroundColor: sg.color }]} />
            {/* Label */}
            <Text variant="caption" color="textSecondary" style={styles.legendLabel}>
              {sg.label}
            </Text>
            {/* Percentage */}
            <Text variant="caption" weight="semibold" style={styles.legendPct}>
              {sg.pct}%
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    gap: Spacing.three,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.four,
  },
  loadingContainer: {
    alignItems: 'center',
    gap: Spacing.two,
  },
  legend: {
    width: '100%',
    gap: Spacing.one,
  },
  legendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingVertical: 2,
  },
  swatch: {
    width: 10,
    height: 10,
    borderRadius: Radii.sm,
  },
  legendLabel: {
    flex: 1,
  },
  legendPct: {
    minWidth: 36,
    textAlign: 'right',
  },
});
