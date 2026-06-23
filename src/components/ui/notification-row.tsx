// notification-row.tsx — A single notification displayed as a pressable card.
import { StyleSheet, View } from 'react-native';

import { Radii, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { type AppNotification } from '@/lib/notifications';
import { Card } from '@/components/ui/card';
import { Text } from '@/components/ui/text';

export type NotificationRowProps = {
  notification: AppNotification;
  onPress: () => void;
};

/**
 * NotificationRow — renders one notification inside a Card.
 * Unread notifications show a small coloured dot (testID "unread-dot").
 * Read notifications omit the dot and render at reduced opacity.
 */
export function NotificationRow({ notification, onPress }: NotificationRowProps) {
  const theme = useTheme();
  const { title, body, is_read, created_at } = notification;

  return (
    <Card onPress={onPress} style={is_read ? styles.dimmed : undefined}>
      <View style={styles.row}>
        {/* Unread indicator dot — only shown for unread notifications */}
        {!is_read && (
          <View
            testID="unread-dot"
            style={[styles.dot, { backgroundColor: theme.primary }]}
          />
        )}
        <View style={styles.content}>
          <Text variant="heading">{title}</Text>
          <Text variant="body" color="textSecondary">
            {body}
          </Text>
          <Text variant="caption" color="textSecondary">
            {new Date(created_at).toLocaleString()}
          </Text>
        </View>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.two,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: Radii.pill,
    marginTop: Spacing.one,
    flexShrink: 0,
  },
  content: {
    flex: 1,
    gap: Spacing.half,
  },
  dimmed: {
    opacity: 0.7,
  },
});
