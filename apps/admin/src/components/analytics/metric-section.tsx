// metric-section.tsx — titled wrapper grouping a set of metric cards/charts.
import type { ReactNode } from 'react';
import { View, StyleSheet } from 'react-native';
import { SectionHeader } from '@/components/ui/section-header';
import { Spacing } from '@/constants/theme';

export function MetricSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={styles.section}>
      <SectionHeader title={title} />
      <View style={styles.body}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: Spacing.two, marginBottom: Spacing.three },
  body: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
});
