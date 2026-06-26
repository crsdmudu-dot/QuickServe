import { StyleSheet, View } from 'react-native';

import { Radii, Spacing, Typography, Weights } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { formatKes } from '@/lib/currency';
import { Card } from '@/components/ui/card';
import { IconChip } from '@/components/ui/icon-chip';
import { Text } from '@/components/ui/text';

export type ServiceCardProps = {
  icon: string;
  title: string;
  subtitle?: string;
  startingPrice?: number;
  badge?: 'Popular' | 'New';
  onPress?: () => void;
};

export function ServiceCard({
  icon,
  title,
  subtitle,
  startingPrice,
  badge,
  onPress,
}: ServiceCardProps) {
  const theme = useTheme();
  return (
    <Card onPress={onPress} elevation="e1">
      {badge ? (
        <View style={[styles.badge, { backgroundColor: theme.primarySurface }]}>
          <Text variant="caption" color="primary" style={styles.badgeText}>
            {badge}
          </Text>
        </View>
      ) : null}
      <IconChip icon={icon} />
      <Text variant="label" numberOfLines={1} ellipsizeMode="tail" style={styles.title}>
        {title}
      </Text>
      {subtitle ? (
        <Text
          variant="caption"
          color="textSecondary"
          style={styles.subtitle}
          numberOfLines={1}
        >
          {subtitle}
        </Text>
      ) : null}
      {startingPrice != null ? (
        <Text variant="caption" color="primary" style={styles.price}>
          {`from ${formatKes(startingPrice)}`}
        </Text>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  badge: {
    position: 'absolute',
    top: Spacing.two,
    right: Spacing.two,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.half,
    borderRadius: Radii.pill,
    zIndex: 1,
  },
  badgeText: {
    fontWeight: Weights.semibold,
  },
  title: {
    marginTop: Spacing.two,
  },
  subtitle: { marginTop: Spacing.half },
  price: { marginTop: Spacing.two, fontWeight: Weights.semibold },
});
