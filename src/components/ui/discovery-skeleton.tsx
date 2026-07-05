// discovery-skeleton.tsx — Loading placeholders for provider/service discovery.
// Composes the EXISTING Skeleton primitive — does NOT reimplement shimmer.

import { StyleSheet, View } from 'react-native';

import { Radii, Spacing } from '@/constants/theme';
import { Skeleton } from '@/components/ui/skeleton';

export type DiscoverySkeletonProps = {
  /**
   * Layout variant:
   * - 'card'  → tall card (provider card shape)
   * - 'row'   → horizontal row (list item shape)
   * - 'grid'  → compact square (service grid cell)
   */
  variant?: 'card' | 'row' | 'grid';
  /** Number of placeholder items to render. Defaults to 3. */
  count?: number;
};

/** A single provider-card-shaped placeholder. */
function CardSkeleton() {
  return (
    <View style={styles.card} testID="discovery-skeleton-card">
      {/* Top row: avatar circle + name/badge */}
      <View style={styles.cardTopRow}>
        <Skeleton width={52} height={52} radius={Radii.pill} />
        <View style={styles.cardNameCol}>
          <Skeleton width="60%" height={14} />
          <Skeleton width="40%" height={10} />
        </View>
      </View>
      {/* Stats row */}
      <View style={styles.cardStatsRow}>
        <Skeleton width={80} height={10} />
        <Skeleton width={60} height={10} />
        <Skeleton width={50} height={10} />
      </View>
    </View>
  );
}

/** A single list-row-shaped placeholder. */
function RowSkeleton() {
  return (
    <View style={styles.row} testID="discovery-skeleton-row">
      <Skeleton width={40} height={40} radius={Radii.pill} />
      <View style={styles.rowTextCol}>
        <Skeleton width="55%" height={13} />
        <Skeleton width="35%" height={10} />
      </View>
    </View>
  );
}

/** A single grid-cell-shaped placeholder. */
function GridSkeleton() {
  return (
    <View style={styles.grid} testID="discovery-skeleton-grid">
      <Skeleton width={52} height={52} radius={Radii.lg} />
      <Skeleton width="80%" height={12} />
      <Skeleton width="50%" height={10} />
    </View>
  );
}

/**
 * DiscoverySkeleton renders `count` loading placeholders in the requested layout.
 * Uses the existing Skeleton primitive — no shimmer reimplementation.
 */
export function DiscoverySkeleton({ variant = 'card', count = 3 }: DiscoverySkeletonProps) {
  const items = Array.from({ length: count }, (_, i) => i);

  return (
    <View style={styles.container} testID="discovery-skeleton">
      {items.map((i) => {
        if (variant === 'row') return <RowSkeleton key={i} />;
        if (variant === 'grid') return <GridSkeleton key={i} />;
        return <CardSkeleton key={i} />;
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: Spacing.three,
  },

  // Card variant
  card: {
    gap: Spacing.two,
    padding: Spacing.three,
    borderRadius: Radii.lg,
  },
  cardTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  cardNameCol: {
    flex: 1,
    gap: Spacing.one,
  },
  cardStatsRow: {
    flexDirection: 'row',
    gap: Spacing.two,
    marginTop: Spacing.one,
  },

  // Row variant
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingVertical: Spacing.two,
  },
  rowTextCol: {
    flex: 1,
    gap: Spacing.one,
  },

  // Grid variant
  grid: {
    alignItems: 'center',
    gap: Spacing.one,
    padding: Spacing.two,
  },
});
