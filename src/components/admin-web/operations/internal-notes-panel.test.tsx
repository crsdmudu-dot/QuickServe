/**
 * Tests for InternalNotesPanel
 *
 * Mocks @/lib/operations so no real Supabase calls are made.
 *
 * Covers:
 *   - Renders fetched notes (body + author id slice).
 *   - Shows the "staff only" label.
 *   - Typing + pressing "Add internal note" calls addInternalNote with
 *     the right args and reloads the list.
 *   - No edit or delete controls are present.
 *   - Shows an error message on addInternalNote failure.
 */

const mockGetInternalNotes = jest.fn();
const mockAddInternalNote = jest.fn();

jest.mock('@/lib/operations', () => ({
  getInternalNotes: (...args: unknown[]) => mockGetInternalNotes(...args),
  addInternalNote:  (...args: unknown[]) => mockAddInternalNote(...args),
}));

import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import { InternalNotesPanel } from '@/components/admin-web/operations/internal-notes-panel';
import type { InternalNote } from '@/constants/operations';

// ── Fixture ─────────────────────────────────────────────────────────────────

const NOTE_FIXTURE: InternalNote = {
  id: 'note-001',
  subject_type: 'booking',
  subject_id:   'booking-abc',
  created_at:   '2024-01-01T10:00:00Z',
  author_id:    'author-11111111-aaaa-bbbb-cccc-000000000000',
  body:         'This is a staff note',
};

// ── Tests ──────────────────────────────────────────────────────────────────

describe('InternalNotesPanel', () => {
  beforeEach(() => {
    mockGetInternalNotes.mockClear();
    mockAddInternalNote.mockClear();
  });

  it('renders fetched notes on mount', async () => {
    mockGetInternalNotes.mockResolvedValue([NOTE_FIXTURE]);
    render(<InternalNotesPanel subjectType="booking" subjectId="booking-abc" />);
    await waitFor(() => {
      expect(screen.getByText('This is a staff note')).toBeOnTheScreen();
    });
    // Author id slice: first 8 chars = "author-1", displayed as "#author-1"
    expect(screen.getByText(/#author-1/)).toBeOnTheScreen();
  });

  it('shows the "staff only" label', async () => {
    mockGetInternalNotes.mockResolvedValue([]);
    render(<InternalNotesPanel subjectType="booking" subjectId="booking-abc" />);
    await waitFor(() => {
      expect(
        screen.getByText(/staff only/i),
      ).toBeOnTheScreen();
    });
  });

  it('calls addInternalNote with correct args and reloads on success', async () => {
    mockGetInternalNotes.mockResolvedValue([NOTE_FIXTURE]);
    mockAddInternalNote.mockResolvedValue({ ok: true, id: 'new-note-id' });

    render(<InternalNotesPanel subjectType="booking" subjectId="booking-abc" />);
    await waitFor(() => screen.getByText('This is a staff note'));

    // Type in the composer
    fireEvent.changeText(
      screen.getByPlaceholderText('Write an internal note…'),
      'New admin note',
    );

    // Press submit
    fireEvent.press(screen.getByText('Add internal note'));

    await waitFor(() => {
      expect(mockAddInternalNote).toHaveBeenCalledWith(
        'booking',
        'booking-abc',
        'New admin note',
      );
    });
    // List should reload (getInternalNotes called again)
    expect(mockGetInternalNotes.mock.calls.length).toBeGreaterThan(1);
  });

  it('shows error message when addInternalNote fails', async () => {
    mockGetInternalNotes.mockResolvedValue([]);
    mockAddInternalNote.mockResolvedValue({ ok: false, error: 'Server error' });

    render(<InternalNotesPanel subjectType="customer" subjectId="cust-xyz" />);
    await waitFor(() => screen.getByText('Add internal note'));

    fireEvent.changeText(
      screen.getByPlaceholderText('Write an internal note…'),
      'Some note',
    );
    fireEvent.press(screen.getByText('Add internal note'));

    await waitFor(() => {
      expect(screen.getByText('Server error')).toBeOnTheScreen();
    });
  });

  it('has no edit or delete controls', async () => {
    mockGetInternalNotes.mockResolvedValue([NOTE_FIXTURE]);
    render(<InternalNotesPanel subjectType="booking" subjectId="booking-abc" />);
    await waitFor(() => screen.getByText('This is a staff note'));

    expect(screen.queryByText(/edit/i)).toBeNull();
    expect(screen.queryByText(/delete/i)).toBeNull();
  });

  it('shows empty state when no notes exist', async () => {
    mockGetInternalNotes.mockResolvedValue([]);
    render(<InternalNotesPanel subjectType="provider" subjectId="prov-123" />);
    await waitFor(() => {
      expect(screen.getByText('No internal notes yet.')).toBeOnTheScreen();
    });
  });
});
