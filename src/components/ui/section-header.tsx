import { Pressable, StyleSheet, View } from 'react-native';

import { Spacing } from '@/constants/theme';
import { Text } from '@/components/ui/text';

export type SectionHeaderProps = {
  title: string;
  onSeeAll?: () => void;
};

export function SectionHeader({ title, onSeeAll }: SectionHeaderProps) {
  return (
    <View style={styles.row}>
      <Text variant="heading" weight="semibold">
        {title}
      </Text>
      {onSeeAll ? (
        <Pressable
          onPress={onSeeAll}
          hitSlop={8}
          style={({ pressed }) => pressed && styles.actionPressed}>
          <Text variant="label" color="primary" weight="medium">
            See all
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.three,
    paddingVertical: Spacing.one,
  },
  actionPressed: { opacity: 0.7 },
});
