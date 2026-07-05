/**
 * src/components/admin-web/operations/internal-notes-panel.tsx
 *
 * InternalNotesPanel — loads and displays internal notes for any subject
 * entity (booking, customer, provider, payment), and provides an append-only
 * composer to add new notes.
 *
 * Important guardrails:
 *   - Notes are APPEND-ONLY — there is no edit or delete UI.
 *   - The "staff only" label is always visible so admins know notes are private.
 *   - No direct Supabase calls — uses getInternalNotes / addInternalNote from
 *     @/lib/operations.
 *
 * Props:
 *   subjectType — entity kind ('booking' | 'customer' | 'provider' | 'payment').
 *   subjectId   — UUID of the entity.
 */

import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Spacing } from '@/constants/theme';
import { type InternalNote, type SubjectType } from '@/constants/operations';
import { getInternalNotes, addInternalNote } from '@/lib/operations';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { SectionHeader } from '@/components/ui/section-header';
import { Text } from '@/components/ui/text';

// ── Props ──────────────────────────────────────────────────────────────────

export type InternalNotesPanelProps = {
  subjectType: SubjectType;
  subjectId: string;
};

// ── Component ──────────────────────────────────────────────────────────────

export function InternalNotesPanel({ subjectType, subjectId }: InternalNotesPanelProps) {
  // ── Notes list state ─────────────────────────────────────────────────────
  const [notes, setNotes] = useState<InternalNote[]>([]);
  const [loading, setLoading] = useState(true);

  // ── Composer state ───────────────────────────────────────────────────────
  const [body, setBody] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  // ── Load notes ───────────────────────────────────────────────────────────
  const loadNotes = useCallback(async () => {
    setLoading(true);
    const data = await getInternalNotes(subjectType, subjectId);
    setNotes(data);
    setLoading(false);
  }, [subjectType, subjectId]);

  useEffect(() => {
    loadNotes();
  }, [loadNotes]);

  // ── Submit handler ────────────────────────────────────────────────────────
  async function handleAddNote() {
    const trimmed = body.trim();
    if (!trimmed) return;
    setSubmitting(true);
    setError('');
    const res = await addInternalNote(subjectType, subjectId, trimmed);
    if (res.ok) {
      setBody('');
      await loadNotes();
    } else {
      setError(res.error ?? 'Could not add note. Please try again.');
    }
    setSubmitting(false);
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <View style={styles.container}>
      <SectionHeader title="Internal notes" />

      {/* Staff-only visibility label — always visible */}
      <Text variant="caption" color="textSecondary" style={styles.staffLabel}>
        Internal notes — staff only. Never shown to customers or providers.
      </Text>

      {/* Notes list (newest first, as returned by getInternalNotes) */}
      {loading && notes.length === 0 ? (
        <Text variant="caption" color="textSecondary">
          Loading…
        </Text>
      ) : notes.length === 0 ? (
        <Text variant="caption" color="textSecondary">
          No internal notes yet.
        </Text>
      ) : (
        notes.map((note) => (
          <Card key={note.id} style={styles.noteCard}>
            <View style={styles.noteHeader}>
              <Text variant="label" weight="medium">
                {`#${note.author_id.slice(0, 8)}`}
              </Text>
              <Text variant="caption" color="textTertiary">
                {new Date(note.created_at).toLocaleString()}
              </Text>
            </View>
            <Text variant="body" color="textSecondary">
              {note.body}
            </Text>
            {/* No edit or delete controls — append-only */}
          </Card>
        ))
      )}

      {/* Composer — append-only (no edit/delete UI) */}
      <SectionHeader title="Add note" />
      <Input
        label="Note body"
        value={body}
        onChangeText={setBody}
        placeholder="Write an internal note…"
        multiline
      />

      {/* Error message */}
      {error ? (
        <Text variant="caption" color="error">
          {error}
        </Text>
      ) : null}

      <Button
        label="Add internal note"
        onPress={handleAddNote}
        disabled={body.trim() === ''}
        loading={submitting}
      />
    </View>
  );
}

// ── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    gap: Spacing.three,
  },
  staffLabel: {
    marginTop: -Spacing.two,
  },
  noteCard: {
    gap: Spacing.one,
  },
  noteHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
});
