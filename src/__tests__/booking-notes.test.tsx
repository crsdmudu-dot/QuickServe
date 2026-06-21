/**
 * Tests for src/app/booking/notes.tsx
 *
 * We mock expo-router (to spy on push) and @/booking/booking-draft.
 * Continue is always allowed on this screen — notes are optional.
 */

jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));

const mockSetNotes = jest.fn();
let mockNotes = '';
jest.mock('@/booking/booking-draft', () => ({
  useBookingDraft: () => ({
    notes: mockNotes,
    setNotes: mockSetNotes,
  }),
}));

import { fireEvent, render, screen } from '@testing-library/react-native';
import { router } from 'expo-router';
import NotesScreen from '@/app/booking/notes';

describe('NotesScreen', () => {
  beforeEach(() => {
    (router.push as jest.Mock).mockClear();
    mockSetNotes.mockClear();
    mockNotes = '';
  });

  it('navigates to /booking/review when Continue is pressed (notes empty)', () => {
    render(<NotesScreen />);
    fireEvent.press(screen.getByText('Continue'));
    expect(router.push).toHaveBeenCalledWith('/booking/review');
  });

  it('navigates to /booking/review even when notes have text', () => {
    mockNotes = 'Please use the back door.';
    render(<NotesScreen />);
    fireEvent.press(screen.getByText('Continue'));
    expect(router.push).toHaveBeenCalledWith('/booking/review');
  });

  it('calls setNotes when the user types', () => {
    render(<NotesScreen />);
    fireEvent.changeText(
      screen.getByPlaceholderText('E.g. use the back entrance, bring your own supplies…'),
      'Bring gloves',
    );
    expect(mockSetNotes).toHaveBeenCalledWith('Bring gloves');
  });
});
