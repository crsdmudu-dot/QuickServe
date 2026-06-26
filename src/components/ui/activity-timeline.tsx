// activity-timeline.tsx — Shows a chronological list of booking activity events.
import { StyleSheet, View } from 'react-native';

import { Radii, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
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
 * ActivityTimeline — renders each booking activity as a row with an icon dot,
 * the event message, and a timestamp caption.  A vertical connector line links
 * consecutive events.  Shows "No activity yet" when the events array is empty.
 */
export function ActivityTimeline({ events }: ActivityTimelineProps) {
  const theme = useTheme();

  if (events.length === 0) {
    return (
      <Text variant="body" color="textSecondary">
        No activity yet
      </Text>
    );
  }

  return (
    <View style={styles.container}>
      {events.map((event, index) => {
        const isLast = index === events.length - 1;
        return (
          <View key={event.id} style={styles.row}>
            {/* Left column: dot + connector */}
            <View style={styles.dotColumn}>
              <View style={[styles.dot, { backgroundColor: theme.primary, borderColor: theme.primarySurface }]} />
              {!isLast && <View style={[styles.connector, { backgroundColor: theme.border }]} />}
            </View>

            {/* Right column: icon, message, timestamp */}
            <View style={styles.content}>
              <Text variant="body">{EVENT_ICON[event.event_type] ?? '•'}</Text>
              <Text variant="body">{event.message}</Text>
              <Text variant="caption" color="textSecondary">
                {new Date(event.created_at).toLocaleString()}
              </Text>
            </View>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 0,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.two,
  },
  dotColumn: {
    alignItems: 'center',
    width: 16,
    paddingTop: Spacing.one,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: Radii.pill,
    borderWidth: 2,
  },
  connector: {
    width: 2,
    flex: 1,
    minHeight: Spacing.four,
    marginTop: Spacing.one,
  },
  content: {
    flex: 1,
    gap: Spacing.half,
    paddingBottom: Spacing.three,
  },
});
