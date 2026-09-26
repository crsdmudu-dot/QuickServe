// message-bubble.tsx — Pure presentational chat bubble used in the in-app
// chat screen.  Renders an outgoing (right) or incoming (left) bubble with
// optional sender label and localised timestamp.

import { Pressable, StyleSheet, View, type ViewProps } from 'react-native';

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
  /** Optional long-press action (used to report the other person's message). */
  onLongPress?: () => void;
  /** Optional short note under the text, e.g. "Hidden by moderation" in the admin viewer. */
  note?: string;
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
  onLongPress,
  note,
}: MessageBubbleProps) {
  const theme = useTheme();

  // Own message → primarySurface; other → surfaceMuted.
  const backgroundColor =
    align === 'right' ? theme.primarySurface : theme.surfaceMuted;

  const bubbleStyle = [
    styles.bubble,
    { backgroundColor, alignSelf: align === 'right' ? ('flex-end' as const) : ('flex-start' as const) },
  ];

  const content = (
    <>
      {label != null && (
        <Text variant="caption" color="textSecondary">
          {label}
        </Text>
      )}

      <Text variant="body">{text}</Text>

      {note != null && (
        <Text variant="caption" color="error">
          {note}
        </Text>
      )}

      <Text variant="caption" color="textSecondary">
        {new Date(timestamp).toLocaleTimeString()}
      </Text>
    </>
  );

  // A long-press target is only added when there is an action; plain bubbles stay plain Views.
  if (onLongPress) {
    return (
      <Pressable
        testID={testID}
        style={bubbleStyle}
        onLongPress={onLongPress}
        accessibilityHint="Long-press to report this message"
      >
        {content}
      </Pressable>
    );
  }

  return (
    <View testID={testID} style={bubbleStyle}>
      {content}
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
