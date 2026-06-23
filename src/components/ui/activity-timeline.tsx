// activity-timeline.tsx — Shows a chronological list of booking activity events.
import { StyleSheet, View } from 'react-native';

import { Spacing } from '@/constants/theme';
import { type BookingActivity } from '@/lib/activity';
import { Text } from '@/components/ui/text';

// Maps event_type strings to a friendly emoji icon; falls back to '•'.
const EVENT_ICON: Record<string, string> = {
  booking_created: '📝',
  accepted: '✅',
  provider_assigned: '👷',
  on_the_way: '🚗',
  in_progress: '🔧',
  completed: '🎉',
  cancelled: '❌',
  issue_photo_added: '📷',
  before_photo_added: '📷',
  after_photo_added: '📷',
  completion_photo_added: '📷',
  photos_verified: '✔️',
};

export type ActivityTimelineProps = {
  events: BookingActivity[];
};

/**
 * ActivityTimeline — renders each booking activity as a row with an icon,
 * the event message, and a timestamp caption.  Shows "No activity yet" when
 * the events array is empty.
 */
export function ActivityTimeline({ events }: ActivityTimelineProps) {
  if (events.length === 0) {
    return (
      <Text variant="body" color="textSecondary">
        No activity yet
      </Text>
    );
  }

  return (
    <View style={styles.container}>
      {events.map((event) => (
        <View key={event.id} style={styles.row}>
          <Text variant="body">{EVENT_ICON[event.event_type] ?? '•'}</Text>
          <View style={styles.content}>
            <Text variant="body">{event.message}</Text>
            <Text variant="caption" color="textSecondary">
              {new Date(event.created_at).toLocaleString()}
            </Text>
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: Spacing.two,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.two,
  },
  content: {
    flex: 1,
    gap: Spacing.half,
  },
});
