// verified-badge.tsx — Pill badge indicating QuickServe has verified the provider.
import { StyleSheet, View } from 'react-native';

import { Radii, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { Text } from '@/components/ui/text';

export function VerifiedBadge() {
  const theme = useTheme();

  return (
    <View style={[styles.pill, { backgroundColor: theme.primarySurface }]}>
      <Text variant="caption" color="primary">
        Verified by QuickServe
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    alignSelf: 'flex-start',
    borderRadius: Radii.pill,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.one,
  },
});
