/**
 * data-table.tsx
 *
 * Generic responsive table/list component for the admin panel.
 *
 * - Header row (token-styled) + body rows.
 * - loading=true  → renders Skeleton placeholder rows instead of data.
 * - error=true    → renders an inline error block with optional Retry button.
 * - rows.length===0 && !loading && !error → renders an EmptyState.
 * - onRowPress is optional; when provided the row is wrapped in Pressable.
 * - Column.align='right' right-aligns the header text and cell content.
 *
 * RN/RN-web safe — no DOM-only APIs. Hover affordance is Platform.OS==='web' guarded.
 */

import { type JSX, type ReactNode, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/button';
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
  /** Optional text alignment for header + cells. Defaults to 'left'. */
  align?: 'left' | 'right';
};

export type DataTableProps<T> = {
  columns: Column<T>[];
  rows: T[];
  keyExtractor: (row: T) => string;
  onRowPress?: (row: T) => void;
  loading?: boolean;
  emptyLabel?: string;
  /** When true shows an inline error message instead of rows or empty state. */
  error?: boolean;
  /** Called when the user presses the Retry button in the error state. */
  onRetry?: () => void;
};

// Number of skeleton rows shown while loading.
const SKELETON_ROW_COUNT = 5;

// ── Sub-components ─────────────────────────────────────────────────────────

/** Inline error block rendered when error=true and loading=false. */
function InlineError({ onRetry }: { onRetry?: () => void }): JSX.Element {
  return (
    <View style={styles.inlineError} testID="data-table-error">
      <Text variant="body" color="textSecondary" style={styles.errorText}>
        Couldn't load. Please try again.
      </Text>
      {onRetry != null && (
        <Button label="Retry" variant="secondary" size="md" onPress={onRetry} />
      )}
    </View>
  );
}

// ── Component ──────────────────────────────────────────────────────────────

export function DataTable<T>(props: DataTableProps<T>): JSX.Element {
  const {
    columns,
    rows,
    keyExtractor,
    onRowPress,
    loading = false,
    emptyLabel = 'No data',
    error = false,
    onRetry,
  } = props;
  const theme = useTheme();

  // Track which row is hovered — web only, ignored on native.
  const [hoveredKey, setHoveredKey] = useState<string | null>(null);

  // ── Loading state (highest precedence) ────────────────────────────────

  if (loading) {
    return (
      <View style={[styles.container, { borderColor: theme.border, backgroundColor: theme.surface }]}>
        {/* Header */}
        <View style={[styles.headerRow, { backgroundColor: theme.surfaceMuted, borderBottomColor: theme.border }]}>
          {columns.map((col) => (
            <View
              key={col.key}
              style={[
                styles.cell,
                col.width != null ? { width: col.width, flexGrow: 0 } : { flex: 1 },
                col.align === 'right' && styles.cellRight,
              ]}>
              <Text
                variant="label"
                color="textSecondary"
                weight="semibold"
                style={col.align === 'right' ? styles.textRight : undefined}>
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

  // ── Error state ────────────────────────────────────────────────────────

  if (error) {
    return (
      <View style={[styles.container, { borderColor: theme.border, backgroundColor: theme.surface }]}>
        <InlineError onRetry={onRetry} />
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
            <View
              key={col.key}
              style={[
                styles.cell,
                col.width != null ? { width: col.width, flexGrow: 0 } : { flex: 1 },
                col.align === 'right' && styles.cellRight,
              ]}>
              <Text
                variant="label"
                color="textSecondary"
                weight="semibold"
                style={col.align === 'right' ? styles.textRight : undefined}>
                {col.header}
              </Text>
            </View>
          ))}
        </View>

        {/* Data rows */}
        {rows.map((row, index) => {
          const isLast = index === rows.length - 1;
          const rowKey = keyExtractor(row);
          const isHovered = Platform.OS === 'web' && hoveredKey === rowKey;

          const rowContent = (
            <View
              style={[
                styles.bodyRow,
                { borderBottomColor: theme.border },
                isLast && styles.lastRow,
                // Subtle web hover affordance — token-driven, native-safe.
                isHovered && { backgroundColor: theme.surfaceMuted },
              ]}>
              {columns.map((col) => (
                <View
                  key={col.key}
                  style={[
                    styles.cell,
                    col.width != null ? { width: col.width, flexGrow: 0 } : { flex: 1 },
                    col.align === 'right' && styles.cellRight,
                  ]}>
                  {col.render(row)}
                </View>
              ))}
            </View>
          );

          if (onRowPress) {
            return (
              <Pressable
                key={rowKey}
                accessibilityRole="button"
                onPress={() => onRowPress(row)}
                // Web hover: set/clear hovered row key; guarded so native never runs this.
                onHoverIn={Platform.OS === 'web' ? () => setHoveredKey(rowKey) : undefined}
                onHoverOut={Platform.OS === 'web' ? () => setHoveredKey(null) : undefined}
                style={({ pressed }) => pressed && { opacity: 0.75 }}>
                {rowContent}
              </Pressable>
            );
          }

          return <View key={rowKey}>{rowContent}</View>;
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
  /** Right-aligned cell: flip justifyContent so children stack to the right. */
  cellRight: {
    alignItems: 'flex-end',
  },
  textRight: {
    textAlign: 'right',
  },
  inlineError: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.five,
    paddingHorizontal: Spacing.four,
    gap: Spacing.three,
  },
  errorText: {
    textAlign: 'center',
  },
});
