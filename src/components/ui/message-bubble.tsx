// message-bubble.tsx — Pure presentational chat bubble used in the in-app
// chat screen.  Renders an outgoing (right) or incoming (left) bubble with
// optional sender label and localised timestamp.

import { StyleSheet, View, type ViewProps } from 'react-native';

import { Radii, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { Text } from '@/components/ui/text';

export type MessageBubbleProps = {
  /** The message body text. */
  text: string;
  /** ISO 8601 date-time string; rendered as a locale time (HH:MM AM/PM). */
  timestamp: string;
  /** 'right' = own message; 'left' = the other participant's message. */
  align: 'left' | 'right';
  /** Optional sender label shown above the text (used by the admin viewer). */
  label?: string;
  /** testID forwarded to the outer bubble View for style assertions in tests. */
  testID?: ViewProps['testID'];
};

/**
 * MessageBubble renders a single chat message inside a rounded card bubble.
 *
 * - right (own):  aligned to the end of the row, primarySurface background.
 * - left (other): aligned to the start of the row, surfaceMuted background.
 */
export function MessageBubble({
  text,
  timestamp,
  align,
  label,
  testID,
}: MessageBubbleProps) {
  const theme = useTheme();

  // Own message → primarySurface; other → surfaceMuted.
  const backgroundColor =
    align === 'right' ? theme.primarySurface : theme.surfaceMuted;

  return (
    <View
      testID={testID}
      style={[
        styles.bubble,
        { backgroundColor, alignSelf: align === 'right' ? 'flex-end' : 'flex-start' },
      ]}
    >
      {label != null && (
        <Text variant="caption" color="textSecondary">
          {label}
        </Text>
      )}

      <Text variant="body">{text}</Text>

      <Text variant="caption" color="textSecondary">
        {new Date(timestamp).toLocaleTimeString()}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  bubble: {
    maxWidth: '80%',
    borderRadius: Radii.xl,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    gap: Spacing.one,
  },
});
