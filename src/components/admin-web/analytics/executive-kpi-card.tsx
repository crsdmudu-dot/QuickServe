// executive-kpi-card.tsx — presentational KPI card with a snapshot/period tag.
// Supports an optional loading state that renders Skeleton placeholders instead
// of the real value/label content while data is being fetched.
import { View, StyleSheet } from 'react-native';
import { Card } from '@/components/ui/card';
import { Text } from '@/components/ui/text';
import { Skeleton } from '@/components/ui/skeleton';
import { Spacing } from '@/constants/theme';

export type ExecutiveKpiCardProps = {
  label: string;
  value: string;
  kind: 'snapshot' | 'period';
  sublabel?: string;
  /** When true, renders Skeleton placeholders instead of value/tag content. */
  loading?: boolean;
};

export function ExecutiveKpiCard({ label, value, kind, sublabel, loading }: ExecutiveKpiCardProps) {
  return (
    <Card style={styles.card}>
      <Text variant="caption" color="textSecondary">{label}</Text>
      {loading ? (
        <View style={styles.skeletonGroup}>
          <Skeleton testID="kpi-skeleton" width="60%" height={28} />
          <Skeleton width="40%" height={14} />
        </View>
      ) : (
        <>
          <Text variant="title">{value}</Text>
          <Text variant="caption" color="textSecondary">
            {kind === 'snapshot' ? 'Current' : 'Selected period'}
          </Text>
          {sublabel ? <Text variant="caption" color="textSecondary">{sublabel}</Text> : null}
        </>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: Spacing.one, minWidth: 160, flexGrow: 1 },
  skeletonGroup: { gap: Spacing.two },
});
