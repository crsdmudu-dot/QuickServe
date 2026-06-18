import { StyleSheet, Text as RNText, View } from 'react-native';

import { Spacing } from '@/constants/theme';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';

export type EmptyStateProps = {
  icon: string;
  title: string;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
};

export function EmptyState({ icon, title, message, actionLabel, onAction }: EmptyStateProps) {
  return (
    <View style={styles.container}>
      <RNText style={styles.icon}>{icon}</RNText>
      <Text variant="heading" style={styles.center}>
        {title}
      </Text>
      <Text variant="body" color="textSecondary" style={styles.center}>
        {message}
      </Text>
      {actionLabel && onAction ? <Button label={actionLabel} onPress={onAction} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { alignItems: 'center', justifyContent: 'center', gap: Spacing.two, padding: Spacing.five },
  icon: { fontSize: 48, marginBottom: Spacing.two },
  center: { textAlign: 'center' },
});
