/**
 * data-table.tsx
 *
 * Generic responsive table/list component for the admin panel.
 *
 * - Header row (token-styled) + body rows.
 * - loading=true  → renders Skeleton placeholder rows instead of data.
 * - rows.length===0 && !loading → renders an EmptyState.
 * - onRowPress is optional; when provided the row is wrapped in Pressable.
 *
 * RN/RN-web safe — no DOM-only APIs.
 */

import { type JSX, type ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { Text } from '@/components/ui/text';
import { Radii, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

// ── Types ──────────────────────────────────────────────────────────────────

export type Column<T> = {
  key: string;
  header: string;
  render: (row: T) => ReactNode;
  width?: number | `${number}%`;
};

export type DataTableProps<T> = {
  columns: Column<T>[];
  rows: T[];
  keyExtractor: (row: T) => string;
  onRowPress?: (row: T) => void;
  loading?: boolean;
  emptyLabel?: string;
};

// Number of skeleton rows shown while loading.
const SKELETON_ROW_COUNT = 5;

// ── Component ──────────────────────────────────────────────────────────────

export function DataTable<T>(props: DataTableProps<T>): JSX.Element {
  const { columns, rows, keyExtractor, onRowPress, loading = false, emptyLabel = 'No data' } = props;
  const theme = useTheme();

  // ── Loading state ──────────────────────────────────────────────────────

  if (loading) {
    return (
      <View style={[styles.container, { borderColor: theme.border, backgroundColor: theme.surface }]}>
        {/* Header */}
        <View style={[styles.headerRow, { backgroundColor: theme.surfaceMuted, borderBottomColor: theme.border }]}>
          {columns.map((col) => (
            <View key={col.key} style={[styles.cell, col.width != null ? { width: col.width, flexGrow: 0 } : { flex: 1 }]}>
              <Text variant="label" color="textSecondary" weight="semibold">
                {col.header}
              </Text>
            </View>
          ))}
        </View>

        {/* Skeleton rows */}
        {Array.from({ length: SKELETON_ROW_COUNT }).map((_, i) => (
          <View
            key={i}
            style={[
              styles.bodyRow,
              { borderBottomColor: theme.border },
              i === SKELETON_ROW_COUNT - 1 && styles.lastRow,
            ]}>
            {columns.map((col) => (
              <View key={col.key} style={[styles.cell, col.width != null ? { width: col.width, flexGrow: 0 } : { flex: 1 }]}>
                <Skeleton height={14} width="80%" />
              </View>
            ))}
          </View>
        ))}
      </View>
    );
  }

  // ── Empty state ────────────────────────────────────────────────────────

  if (rows.length === 0) {
    return (
      <View style={[styles.container, { borderColor: theme.border, backgroundColor: theme.surface }]}>
        <EmptyState icon="📋" title={emptyLabel} message="Nothing to show here yet." />
      </View>
    );
  }

  // ── Data rows ──────────────────────────────────────────────────────────

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.scrollOuter}>
      <View style={[styles.container, { borderColor: theme.border, backgroundColor: theme.surface }]}>
        {/* Header */}
        <View style={[styles.headerRow, { backgroundColor: theme.surfaceMuted, borderBottomColor: theme.border }]}>
          {columns.map((col) => (
            <View key={col.key} style={[styles.cell, col.width != null ? { width: col.width, flexGrow: 0 } : { flex: 1 }]}>
              <Text variant="label" color="textSecondary" weight="semibold">
                {col.header}
              </Text>
            </View>
          ))}
        </View>

        {/* Data rows */}
        {rows.map((row, index) => {
          const isLast = index === rows.length - 1;
          const rowContent = (
            <View
              style={[
                styles.bodyRow,
                { borderBottomColor: theme.border },
                isLast && styles.lastRow,
              ]}>
              {columns.map((col) => (
                <View key={col.key} style={[styles.cell, col.width != null ? { width: col.width, flexGrow: 0 } : { flex: 1 }]}>
                  {col.render(row)}
                </View>
              ))}
            </View>
          );

          if (onRowPress) {
            return (
              <Pressable
                key={keyExtractor(row)}
                accessibilityRole="button"
                onPress={() => onRowPress(row)}
                style={({ pressed }) => pressed && { opacity: 0.75 }}>
                {rowContent}
              </Pressable>
            );
          }

          return <View key={keyExtractor(row)}>{rowContent}</View>;
        })}
      </View>
    </ScrollView>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  scrollOuter: {
    // Allows horizontal scroll on narrow screens.
  },
  container: {
    borderRadius: Radii.md,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  headerRow: {
    flexDirection: 'row',
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  bodyRow: {
    flexDirection: 'row',
    paddingVertical: Spacing.two + 2,
    paddingHorizontal: Spacing.three,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  lastRow: {
    borderBottomWidth: 0,
  },
  cell: {
    paddingHorizontal: Spacing.two,
    justifyContent: 'center',
    minWidth: 80,
  },
});
