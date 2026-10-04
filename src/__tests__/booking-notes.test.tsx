/**
 * Tests for src/app/booking/notes.tsx
 *
 * We mock expo-router (to spy on push), @/booking/booking-draft, and
 * expo-image-picker.  Continue is always allowed on this screen — notes are
 * optional.  Picking an image calls addIssuePhoto with the resulting URI.
 */

jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));

const mockSetNotes = jest.fn();
const mockAddIssuePhoto = jest.fn();
const mockRemoveIssuePhoto = jest.fn();
let mockNotes = '';
let mockIssuePhotos: string[] = [];
jest.mock('@/booking/booking-draft', () => ({
  useBookingDraft: () => ({
    notes: mockNotes,
    setNotes: mockSetNotes,
    issuePhotos: mockIssuePhotos,
    addIssuePhoto: mockAddIssuePhoto,
    removeIssuePhoto: mockRemoveIssuePhoto,
  }),
}));

const mockLaunchImageLibraryAsync = jest.fn();
const mockRequestMediaLibraryPermissionsAsync = jest.fn();
jest.mock('expo-image-picker', () => ({
  requestMediaLibraryPermissionsAsync: (...args: unknown[]) =>
    mockRequestMediaLibraryPermissionsAsync(...args),
  launchImageLibraryAsync: (...args: unknown[]) => mockLaunchImageLibraryAsync(...args),
}));

import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';
import NotesScreen from '@/app/booking/notes';

describe('NotesScreen', () => {
  beforeEach(() => {
    (router.push as jest.Mock).mockClear();
    mockSetNotes.mockClear();
    mockAddIssuePhoto.mockClear();
    mockRemoveIssuePhoto.mockClear();
    mockNotes = '';
    mockIssuePhotos = [];
    mockRequestMediaLibraryPermissionsAsync.mockClear();
    mockLaunchImageLibraryAsync.mockClear();
    mockLaunchImageLibraryAsync.mockResolvedValue({ canceled: true });
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

  it('calls addIssuePhoto with the picked URI when an image is selected', async () => {
    mockLaunchImageLibraryAsync.mockResolvedValue({
      canceled: false,
      assets: [{ uri: 'file://picked.jpg' }],
    });

    render(<NotesScreen />);
    fireEvent.press(screen.getByText('Pick photo from library'));

    await waitFor(() => expect(mockAddIssuePhoto).toHaveBeenCalledWith('file://picked.jpg'));
  });

  it('does NOT call addIssuePhoto when the picker is cancelled', async () => {
    mockLaunchImageLibraryAsync.mockResolvedValue({ canceled: true });

    render(<NotesScreen />);
    fireEvent.press(screen.getByText('Pick photo from library'));

    await waitFor(() => expect(mockLaunchImageLibraryAsync).toHaveBeenCalled());
    expect(mockAddIssuePhoto).not.toHaveBeenCalled();
  });

  it('opens the images-only system picker without asking for photo-library permission (C-124-7)', async () => {
    render(<NotesScreen />);
    fireEvent.press(screen.getByText('Pick photo from library'));

    await waitFor(() => expect(mockLaunchImageLibraryAsync).toHaveBeenCalledWith({ mediaTypes: ['images'] }));
    expect(mockRequestMediaLibraryPermissionsAsync).not.toHaveBeenCalled();
  });
});
