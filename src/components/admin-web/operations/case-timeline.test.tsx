/**
 * Tests for CaseTimeline
 *
 * Covers:
 *   - Empty state when both notes and events are empty.
 *   - Renders merged notes + events in chronological order (oldest first).
 *   - Event row: shows actor id slice + humanized event_type + from/to values.
 *   - Note row: shows author id slice + note body.
 */

import { render, screen } from '@testing-library/react-native';
import { CaseTimeline } from '@/components/admin-web/operations/case-timeline';
import type { SupportCaseNote, SupportCaseEvent } from '@/constants/operations';

// ── Fixtures ────────────────────────────────────────────────────────────────

const NOTE_EARLY: SupportCaseNote = {
  id: 'note-aaa',
  case_id: 'case-1',
  created_at: '2024-01-01T08:00:00Z',
  author_id: 'author-11111111-0000-0000-0000-000000000000',
  body: 'This is an early note',
  note_type: 'internal',
};

const EVENT_LATE: SupportCaseEvent = {
  id: 'event-bbb',
  case_id: 'case-1',
  created_at: '2024-01-01T10:00:00Z',
  actor_id: 'actor-22222222-0000-0000-0000-000000000000',
  event_type: 'status_changed',
  from_value: 'open',
  to_value: 'in_review',
};

const NOTE_MIDDLE: SupportCaseNote = {
  id: 'note-ccc',
  case_id: 'case-1',
  created_at: '2024-01-01T09:00:00Z',
  author_id: 'author-33333333-0000-0000-0000-000000000000',
  body: 'A middle note',
  note_type: 'resolution',
};

// ── Tests ──────────────────────────────────────────────────────────────────

describe('CaseTimeline', () => {
  it('shows empty state when both notes and events are empty', () => {
    render(<CaseTimeline notes={[]} events={[]} />);
    expect(screen.getByText('No timeline activity yet.')).toBeOnTheScreen();
  });

  it('renders a note body and author id slice', () => {
    render(<CaseTimeline notes={[NOTE_EARLY]} events={[]} />);
    expect(screen.getByText('This is an early note')).toBeOnTheScreen();
    // Author id slice: first 8 chars of author_id prefixed with # = "#author-1"
    expect(screen.getByText(/#author-1/)).toBeOnTheScreen();
  });

  it('renders an event with humanized event_type and from→to values', () => {
    render(<CaseTimeline notes={[]} events={[EVENT_LATE]} />);
    // Humanized: "Status Changed"
    expect(screen.getByText(/Status Changed/)).toBeOnTheScreen();
    expect(screen.getByText(/open.*in_review/)).toBeOnTheScreen();
  });

  it('renders merged list in chronological order (oldest first)', () => {
    render(
      <CaseTimeline
        notes={[NOTE_EARLY, NOTE_MIDDLE]}
        events={[EVENT_LATE]}
      />,
    );
    // All three should be visible
    expect(screen.getByText('This is an early note')).toBeOnTheScreen();
    expect(screen.getByText('A middle note')).toBeOnTheScreen();
    expect(screen.getByText(/Status Changed/)).toBeOnTheScreen();
  });

  it('renders resolution note with the right note type label', () => {
    render(<CaseTimeline notes={[NOTE_MIDDLE]} events={[]} />);
    expect(screen.getByText(/Resolution note/)).toBeOnTheScreen();
  });

  it('renders internal note type label', () => {
    render(<CaseTimeline notes={[NOTE_EARLY]} events={[]} />);
    expect(screen.getByText(/Internal note/)).toBeOnTheScreen();
  });
});
