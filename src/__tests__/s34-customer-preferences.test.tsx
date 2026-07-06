/**
 * Tests for src/app/(customer)/preferences.tsx (Slice 34 Task 5)
 *
 * Verifies:
 *   - Favorite-service toggles render; toggle calls add/removeFavoriteService optimistically.
 *   - Default address is shown + "Manage" navigates to /saved-addresses.
 *   - Future-ready prefs are shown as "coming soon" (disabled, no writes).
 */

import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';

// ── Mocks ──────────────────────────────────────────────────────────────────────

jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));

const mockGetFavoriteServiceIds = jest.fn().mockResolvedValue(['house-cleaning']);
const mockAddFavoriteService    = jest.fn().mockResolvedValue({ ok: true });
const mockRemoveFavoriteService = jest.fn().mockResolvedValue({ ok: true });

jest.mock('@/lib/favorite-services', () => ({
  getFavoriteServiceIds:  (...args: unknown[]) => mockGetFavoriteServiceIds(...args),
  addFavoriteService:     (...args: unknown[]) => mockAddFavoriteService(...args),
  removeFavoriteService:  (...args: unknown[]) => mockRemoveFavoriteService(...args),
}));

jest.mock('@/lib/saved-addresses', () => ({
  getMySavedAddresses: jest.fn().mockResolvedValue([
    {
      id: 'a1', is_default: true, address: '123 Main Street, Nairobi', label_type: 'home',
      nickname: null, customer_id: 'u1', address_label: null, latitude: null, longitude: null,
      building_name: null, floor: null, door_number: null, landmark: null,
      access_notes: null, last_used_at: null, created_at: '2024-01-01', updated_at: '2024-01-01',
    },
  ]),
}));

import { router } from 'expo-router';
import PreferencesScreen from '@/app/(customer)/preferences';

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('PreferencesScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetFavoriteServiceIds.mockResolvedValue(['house-cleaning']);
    mockAddFavoriteService.mockResolvedValue({ ok: true });
    mockRemoveFavoriteService.mockResolvedValue({ ok: true });
  });

  it('renders the heading', async () => {
    render(<PreferencesScreen />);
    await waitFor(() => expect(screen.getByText('Preferences')).toBeOnTheScreen());
  });

  it('renders favorite service toggles after loading', async () => {
    render(<PreferencesScreen />);
    // House Cleaning should appear
    await waitFor(() => expect(screen.getByText('House Cleaning')).toBeOnTheScreen());
    // Plumbing should appear too
    expect(screen.getByText('Plumbing')).toBeOnTheScreen();
  });

  it('shows active toggle for house-cleaning (initial favorite)', async () => {
    render(<PreferencesScreen />);
    await waitFor(() => expect(screen.getAllByTestId('fav-service-active').length).toBeGreaterThan(0));
  });

  it('calls removeFavoriteService when an active toggle is pressed', async () => {
    render(<PreferencesScreen />);
    // Wait for data to load and active toggle to appear
    await waitFor(() => expect(screen.getAllByTestId('fav-service-active').length).toBeGreaterThan(0));

    const activeBtns = screen.getAllByTestId('fav-service-active');
    await act(async () => {
      fireEvent.press(activeBtns[0]);
    });

    await waitFor(() => expect(mockRemoveFavoriteService).toHaveBeenCalledWith('house-cleaning'));
  });

  it('calls addFavoriteService when an inactive toggle is pressed', async () => {
    render(<PreferencesScreen />);
    await waitFor(() => expect(screen.getAllByTestId('fav-service-inactive').length).toBeGreaterThan(0));

    const inactiveBtns = screen.getAllByTestId('fav-service-inactive');
    // Press the first inactive toggle — it's for plumbing (second service in SERVICES)
    await act(async () => {
      fireEvent.press(inactiveBtns[0]);
    });

    await waitFor(() => expect(mockAddFavoriteService).toHaveBeenCalled());
  });

  it('shows the default address', async () => {
    render(<PreferencesScreen />);
    await waitFor(() =>
      expect(screen.getByText('123 Main Street, Nairobi')).toBeOnTheScreen(),
    );
  });

  it('navigates to /saved-addresses when "Manage" is pressed', async () => {
    render(<PreferencesScreen />);
    await waitFor(() => expect(screen.getByText('Manage')).toBeOnTheScreen());
    fireEvent.press(screen.getByText('Manage'));
    expect(router.push).toHaveBeenCalledWith('/saved-addresses');
  });

  it('renders future-ready preferences as "coming soon"', async () => {
    render(<PreferencesScreen />);
    await waitFor(() =>
      expect(screen.getAllByText('coming soon').length).toBeGreaterThanOrEqual(3),
    );
  });

  it('does NOT call addFavoriteService or removeFavoriteService when viewing future-ready prefs', async () => {
    render(<PreferencesScreen />);
    await waitFor(() =>
      expect(screen.getAllByText('coming soon').length).toBeGreaterThanOrEqual(3),
    );
    // No writes to favorites from the "coming soon" rows
    expect(mockAddFavoriteService).not.toHaveBeenCalled();
    expect(mockRemoveFavoriteService).not.toHaveBeenCalled();
  });

  it('reverts optimistic toggle on failure', async () => {
    mockRemoveFavoriteService.mockResolvedValueOnce({ ok: false, error: 'Network error' });

    render(<PreferencesScreen />);
    await waitFor(() => expect(screen.getAllByTestId('fav-service-active').length).toBeGreaterThan(0));

    const activeBtns = screen.getAllByTestId('fav-service-active');
    await act(async () => {
      fireEvent.press(activeBtns[0]);
    });

    // After failure, the item should be active again (reverted)
    await waitFor(() => expect(screen.getAllByTestId('fav-service-active').length).toBeGreaterThan(0));
  });
});
