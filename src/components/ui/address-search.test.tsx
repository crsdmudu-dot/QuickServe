/**
 * Tests for AddressSearch.
 *
 * Mocks @/lib/places so no network calls are made.
 * Uses jest fake timers to control the 350 ms debounce, plus waitFor for
 * async state updates after the debounced promise resolves.
 */

// ── Mocks (must appear before imports) ────────────────────────────────────────

jest.mock('@/lib/places', () => ({
  searchPlaces: jest.fn(),
  getPlaceDetails: jest.fn(),
}));

// Also mock @/constants/motion so Skeleton's animation loop doesn't run.
jest.mock('@/constants/motion', () => ({
  prefersReducedMotion: jest.fn().mockResolvedValue(true),
  Durations: { fast: 150, base: 250, slow: 400 },
  Easings: {},
  Springs: {
    gentle: { damping: 18, stiffness: 160 },
    snappy: { damping: 14, stiffness: 220 },
  },
}));

// ── Imports ────────────────────────────────────────────────────────────────────

import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { AddressSearch } from '@/components/ui/address-search';
import { searchPlaces, getPlaceDetails } from '@/lib/places';
import type { PlaceDetailsWithMap, PlaceSuggestion } from '@/lib/places';

// ── Typed mock helpers ─────────────────────────────────────────────────────────

const mockSearchPlaces = searchPlaces as jest.MockedFunction<typeof searchPlaces>;
const mockGetPlaceDetails = getPlaceDetails as jest.MockedFunction<typeof getPlaceDetails>;

// ── Fixtures ───────────────────────────────────────────────────────────────────

const SUGGESTION: PlaceSuggestion = {
  placeId: 'place-001',
  primaryText: '123 Main St',
  secondaryText: 'Dubai, UAE',
};

const DETAILS: PlaceDetailsWithMap = {
  formattedAddress: '123 Main St, Dubai, UAE',
  latitude: 25.2048,
  longitude: 55.2708,
  mapUrl: 'https://maps.example.com/static?place=001',
};

// ── Suite ──────────────────────────────────────────────────────────────────────

describe('AddressSearch', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    mockSearchPlaces.mockResolvedValue([]);
    mockGetPlaceDetails.mockResolvedValue(null);
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  // ── 1. Typing triggers debounced searchPlaces ────────────────────────────────

  it('calls searchPlaces after the debounce and renders suggestions', async () => {
    mockSearchPlaces.mockResolvedValue([SUGGESTION]);

    render(<AddressSearch onSelect={jest.fn()} onManual={jest.fn()} />);

    // Type a query into the search input.
    fireEvent.changeText(screen.getByPlaceholderText('Type your address…'), 'Main');

    // Advance timers past the 350 ms debounce.
    await act(async () => {
      jest.advanceTimersByTime(400);
    });

    // searchPlaces must have been called.
    expect(mockSearchPlaces).toHaveBeenCalledWith('Main');

    // Suggestion primary text and secondary text should appear.
    await waitFor(() => {
      expect(screen.getByText('123 Main St')).toBeOnTheScreen();
      expect(screen.getByText('Dubai, UAE')).toBeOnTheScreen();
    });
  });

  // ── 2. Tapping a suggestion calls getPlaceDetails + onSelect ─────────────────

  it('calls getPlaceDetails and fires onSelect when a suggestion is tapped', async () => {
    mockSearchPlaces.mockResolvedValue([SUGGESTION]);
    mockGetPlaceDetails.mockResolvedValue(DETAILS);

    const onSelect = jest.fn();
    render(<AddressSearch onSelect={onSelect} onManual={jest.fn()} />);

    fireEvent.changeText(screen.getByPlaceholderText('Type your address…'), 'Main');

    await act(async () => {
      jest.advanceTimersByTime(400);
    });

    await waitFor(() => {
      expect(screen.getByText('123 Main St')).toBeOnTheScreen();
    });

    // Press the suggestion card.
    await act(async () => {
      fireEvent.press(screen.getByText('123 Main St'));
    });

    expect(mockGetPlaceDetails).toHaveBeenCalledWith('place-001');
    await waitFor(() => {
      expect(onSelect).toHaveBeenCalledWith(DETAILS, SUGGESTION);
    });
  });

  // ── 3. "Enter address manually" fires onManual ────────────────────────────────

  it('fires onManual when "Enter address manually" is pressed', () => {
    const onManual = jest.fn();
    render(<AddressSearch onSelect={jest.fn()} onManual={onManual} />);

    fireEvent.press(screen.getByText('Enter address manually'));
    expect(onManual).toHaveBeenCalledTimes(1);
  });

  // ── 4. No results shows EmptyState ────────────────────────────────────────────

  it('shows "No matches" empty state when searchPlaces returns an empty array', async () => {
    mockSearchPlaces.mockResolvedValue([]);

    render(<AddressSearch onSelect={jest.fn()} />);

    fireEvent.changeText(screen.getByPlaceholderText('Type your address…'), 'XYZ');

    await act(async () => {
      jest.advanceTimersByTime(400);
    });

    await waitFor(() => {
      expect(screen.getByText('No matches')).toBeOnTheScreen();
    });
  });

  // ── 5. Search error shows inline caption ──────────────────────────────────────

  it('shows an inline error caption when searchPlaces throws', async () => {
    mockSearchPlaces.mockRejectedValue(new Error('Network error'));

    render(<AddressSearch onSelect={jest.fn()} />);

    fireEvent.changeText(screen.getByPlaceholderText('Type your address…'), 'error');

    await act(async () => {
      jest.advanceTimersByTime(400);
    });

    await waitFor(() => {
      expect(screen.getByText('Something went wrong. Please try again.')).toBeOnTheScreen();
    });
  });

  // ── 6. getPlaceDetails returning null shows inline error ─────────────────────

  it('shows an inline error when getPlaceDetails returns null', async () => {
    mockSearchPlaces.mockResolvedValue([SUGGESTION]);
    mockGetPlaceDetails.mockResolvedValue(null);

    const onSelect = jest.fn();
    render(<AddressSearch onSelect={onSelect} />);

    fireEvent.changeText(screen.getByPlaceholderText('Type your address…'), 'Main');

    await act(async () => {
      jest.advanceTimersByTime(400);
    });

    await waitFor(() => {
      expect(screen.getByText('123 Main St')).toBeOnTheScreen();
    });

    await act(async () => {
      fireEvent.press(screen.getByText('123 Main St'));
    });

    await waitFor(() => {
      expect(
        screen.getByText("Couldn't load that address. Please try another or enter manually."),
      ).toBeOnTheScreen();
    });
    expect(onSelect).not.toHaveBeenCalled();
  });

  // ── 7. Empty query clears suggestions ─────────────────────────────────────────

  it('does not call searchPlaces when query is empty', async () => {
    render(<AddressSearch onSelect={jest.fn()} />);

    // Type something first, then clear it.
    fireEvent.changeText(screen.getByPlaceholderText('Type your address…'), 'abc');
    fireEvent.changeText(screen.getByPlaceholderText('Type your address…'), '');

    await act(async () => {
      jest.advanceTimersByTime(400);
    });

    expect(mockSearchPlaces).not.toHaveBeenCalled();
  });
});
