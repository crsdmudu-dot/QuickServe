/**
 * src/components/admin-web/operations/case-timeline.tsx
 *
 * CaseTimeline — display-only chronological merge of SupportCaseNote[] and
 * SupportCaseEvent[].  The parent fetches the data and passes it as props;
 * this component does NO fetching of its own.
 *
 * Rendering rules:
 *   • Merge notes + events into one list sorted oldest-first by created_at.
 *   • Event row: actor id slice + humanized event_type + from→to values + time.
 *   • Note row: author id slice + note_type label + body text + time.
 *   • Empty state when both arrays are empty.
 *
 * Props:
 *   notes  — SupportCaseNote[] (fetched by parent)
 *   events — SupportCaseEvent[] (fetched by parent)
 */

import { StyleSheet, View } from 'react-native';

import { Radii, Spacing } from '@/constants/theme';
import { type SupportCaseNote, type SupportCaseEvent } from '@/constants/operations';
import { useTheme } from '@/hooks/use-theme';
import { Text } from '@/components/ui/text';

// ── Types ──────────────────────────────────────────────────────────────────

type MergedItem =
  | { kind: 'note';  created_at: string; data: SupportCaseNote }
  | { kind: 'event'; created_at: string; data: SupportCaseEvent };

// ── Helpers ────────────────────────────────────────────────────────────────

/** Converts snake_case event_type to a Title Case readable string. */
function humanizeEventType(eventType: string): string {
  return eventType
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/** Returns the first 8 chars of a UUID prefixed with #. */
function idSlice(id: string): string {
  return `#${id.slice(0, 8)}`;
}

/** Returns a note_type label. */
function noteTypeLabel(noteType: string): string {
  if (noteType === 'resolution') return 'Resolution note';
  return 'Internal note';
}

// ── Component ──────────────────────────────────────────────────────────────

export type CaseTimelineProps = {
  notes: SupportCaseNote[];
  events: SupportCaseEvent[];
};

export function CaseTimeline({ notes, events }: CaseTimelineProps) {
  const theme = useTheme();

  // Empty state
  if (notes.length === 0 && events.length === 0) {
    return (
      <Text variant="body" color="textSecondary">
        No timeline activity yet.
      </Text>
    );
  }

  // Merge notes + events into one list sorted oldest-first.
  const merged: MergedItem[] = [
    ...notes.map((n) => ({ kind: 'note' as const,  created_at: n.created_at, data: n })),
    ...events.map((e) => ({ kind: 'event' as const, created_at: e.created_at, data: e })),
  ].sort((a, b) => a.created_at.localeCompare(b.created_at));

  return (
    <View style={styles.container}>
      {merged.map((item, index) => {
        const isLast = index === merged.length - 1;

        return (
          <View key={`${item.kind}-${item.data.id}`} style={styles.row}>
            {/* Left column: dot + connector line */}
            <View style={styles.dotColumn}>
              <View
                style={[
                  styles.dot,
                  {
                    backgroundColor:
                      item.kind === 'event' ? theme.primary : theme.info,
                    borderColor:
                      item.kind === 'event' ? theme.primarySurface : theme.infoSurface,
                  },
                ]}
              />
              {!isLast && (
                <View style={[styles.connector, { backgroundColor: theme.border }]} />
              )}
            </View>

            {/* Right column: content */}
            <View style={styles.content}>
              {item.kind === 'event' ? (
                // ── Event row ──────────────────────────────────────────────
                <>
                  <Text variant="label" weight="medium">
                    {idSlice(item.data.actor_id)}
                    {'  '}
                    {humanizeEventType(item.data.event_type)}
                  </Text>
                  {(item.data.from_value || item.data.to_value) ? (
                    <Text variant="caption" color="textSecondary">
                      {item.data.from_value ?? '—'} → {item.data.to_value ?? '—'}
                    </Text>
                  ) : null}
                </>
              ) : (
                // ── Note row ───────────────────────────────────────────────
                <>
                  <Text variant="label" weight="medium">
                    {idSlice(item.data.author_id)}
                    {'  '}
                    {noteTypeLabel(item.data.note_type)}
                  </Text>
                  <Text variant="body" color="textSecondary">
                    {item.data.body}
                  </Text>
                </>
              )}
              <Text variant="caption" color="textTertiary">
                {new Date(item.created_at).toLocaleString()}
              </Text>
            </View>
          </View>
        );
      })}
    </View>
  );
}

// ── Styles ──────────────────────────────────────────────────────────────────

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
