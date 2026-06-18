import { StyleSheet, View } from 'react-native';

import { Radii, Spacing } from '@/constants/theme';
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
    <Card onPress={onPress}>
      {badge ? (
        <View style={[styles.badge, { backgroundColor: theme.primaryTint }]}>
          <Text variant="caption" color="primaryDark">
            {badge}
          </Text>
        </View>
      ) : null}
      <IconChip icon={icon} />
      <Text variant="label" numberOfLines={1} ellipsizeMode="tail">
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
        <Text variant="caption" color="primaryDark" style={styles.price}>
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
  subtitle: { marginTop: Spacing.half },
  price: { marginTop: Spacing.two, fontWeight: '600' },
});
