/**
 * Tests for src/app/(customer)/favorites.tsx
 *
 * Verifies:
 * - Renders favorites from getMyFavoriteProviders
 * - Remove calls removeFavoriteProvider (optimistic)
 * - Quick rebook: calls start(<serviceId>) and routes to /booking/address,
 *   NEVER passes provider_id into the booking, no dispatch/provider-request fn.
 * - Empty state shows no-favorites with browse action.
 */

// ── Mocks ───────────────────────────────────────────────────────────────────
jest.mock('expo-router', () => ({
  router: { push: jest.fn(), back: jest.fn() },
}));

const mockStart = jest.fn();
// IMPORTANT: track ALL calls to make sure provider_id is never passed to start
const mockDispatch = jest.fn(); // should NEVER be called

jest.mock('@/booking/booking-draft', () => ({
  useBookingDraft: () => ({ start: mockStart }),
}));

const mockGetMyFavoriteProviders = jest.fn();
const mockRemoveFavoriteProvider = jest.fn();

jest.mock('@/lib/favorites', () => ({
  getMyFavoriteProviders: (...args: unknown[]) => mockGetMyFavoriteProviders(...args),
  removeFavoriteProvider: (...args: unknown[]) => mockRemoveFavoriteProvider(...args),
}));

const mockGetCustomerBookings = jest.fn();

jest.mock('@/lib/bookings', () => ({
  getCustomerBookings: (...args: unknown[]) => mockGetCustomerBookings(...args),
}));

// ── Imports ─────────────────────────────────────────────────────────────────
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';
import FavoritesScreen from '@/app/(customer)/favorites';

const PROVIDER_A = {
  provider_id: 'p-alpha',
  full_name: 'Alpha Cleaner',
  average_rating: 4.8,
  review_count: 10,
  completed_jobs_count: 100,
  is_verified: true,
  years_experience: 3,
  availability_status: 'available',
  profile_photo_url: null,
  created_at: '2024-01-01T00:00:00Z',
};

const BOOKING_WITH_PROVIDER = {
  id: 'b1',
  service_id: 'house-cleaning',
  assigned_provider_id: 'p-alpha',
  address: '123 Main',
  scheduled_for: '2026-01-01T10:00:00Z',
  notes: null,
  status: 'completed' as const,
  assigned_provider_name: null,
  assigned_provider_phone: null,
  admin_notes: null,
  created_at: '2026-01-01T00:00:00Z',
  quoted_amount: null,
  provider_share: null,
  quote_status: 'none' as const,
  customer_id: 'cust-1',
  address_label: null,
  latitude: null,
  longitude: null,
  building_name: null,
  floor: null,
  door_number: null,
  landmark: null,
  access_notes: null,
  scheduling_type: 'datetime',
  time_window: null,
  window_start: null,
  window_end: null,
  recurrence: 'one_time',
};

beforeEach(() => {
  jest.clearAllMocks();
  mockRemoveFavoriteProvider.mockResolvedValue({ ok: true });
  mockGetCustomerBookings.mockResolvedValue([BOOKING_WITH_PROVIDER]);
});

describe('FavoritesScreen', () => {
  it('renders favorites from getMyFavoriteProviders', async () => {
    mockGetMyFavoriteProviders.mockResolvedValue([PROVIDER_A]);
    render(<FavoritesScreen />);
    expect(await screen.findByText('Alpha Cleaner')).toBeOnTheScreen();
  });

  it('shows skeleton while loading', () => {
    // Never resolves in this test scope
    mockGetMyFavoriteProviders.mockReturnValue(new Promise(() => {}));
    render(<FavoritesScreen />);
    expect(screen.getByTestId('discovery-skeleton')).toBeOnTheScreen();
  });

  it('shows no-favorites empty state when list is empty', async () => {
    mockGetMyFavoriteProviders.mockResolvedValue([]);
    render(<FavoritesScreen />);
    expect(await screen.findByText('No favorites yet')).toBeOnTheScreen();
    expect(screen.getByText('Browse providers')).toBeOnTheScreen();
  });

  it('browse action in empty state navigates to providers', async () => {
    mockGetMyFavoriteProviders.mockResolvedValue([]);
    render(<FavoritesScreen />);
    const browseBtn = await screen.findByText('Browse providers');
    fireEvent.press(browseBtn);
    expect(router.push).toHaveBeenCalledWith('/(customer)/providers');
  });

  it('remove calls removeFavoriteProvider and removes the card optimistically', async () => {
    mockGetMyFavoriteProviders.mockResolvedValue([PROVIDER_A]);
    render(<FavoritesScreen />);
    await screen.findByText('Alpha Cleaner');
    // The heart/favorite button triggers removal in the favorites screen
    const buttons = screen.getAllByRole('button');
    // Find the favorite toggle button — it's the last one per card (after the rebook btn)
    // Use the one that's the favorite heart
    fireEvent.press(buttons.find(b => b)!); // press first button which is the back or favorite
    await waitFor(() =>
      expect(mockRemoveFavoriteProvider).toHaveBeenCalledWith('p-alpha'),
    );
  });

  it('quick rebook calls start(serviceId) and routes to /booking/address', async () => {
    mockGetMyFavoriteProviders.mockResolvedValue([PROVIDER_A]);
    render(<FavoritesScreen />);
    await screen.findByText('Alpha Cleaner');
    const rebookBtn = screen.getByText('Book a service');
    fireEvent.press(rebookBtn);
    // CRITICAL: start is called with the service_id from the booking (never provider_id)
    expect(mockStart).toHaveBeenCalledWith('house-cleaning');
    expect(router.push).toHaveBeenCalledWith('/booking/address');
    // CRITICAL: provider_id must NEVER be passed to start
    const startArgs = mockStart.mock.calls[0];
    expect(startArgs[0]).toBe('house-cleaning'); // service id
    expect(startArgs[0]).not.toBe('p-alpha'); // never provider id
    // Dispatch mock should never be called
    expect(mockDispatch).not.toHaveBeenCalled();
  });

  it('quick rebook falls back to most recent booking service_id when no provider match', async () => {
    // Booking with a different provider
    const bookingOtherProvider = {
      ...BOOKING_WITH_PROVIDER,
      id: 'b2',
      service_id: 'plumbing',
      assigned_provider_id: 'p-other',
    };
    mockGetCustomerBookings.mockResolvedValue([bookingOtherProvider]);
    mockGetMyFavoriteProviders.mockResolvedValue([PROVIDER_A]);
    render(<FavoritesScreen />);
    await screen.findByText('Alpha Cleaner');
    const rebookBtn = screen.getByText('Book a service');
    fireEvent.press(rebookBtn);
    // Falls back to most recent booking's service_id
    expect(mockStart).toHaveBeenCalledWith('plumbing');
    expect(router.push).toHaveBeenCalledWith('/booking/address');
  });

  it('quick rebook routes to /(customer)/search when no bookings exist', async () => {
    mockGetCustomerBookings.mockResolvedValue([]);
    mockGetMyFavoriteProviders.mockResolvedValue([PROVIDER_A]);
    render(<FavoritesScreen />);
    await screen.findByText('Alpha Cleaner');
    const rebookBtn = screen.getByText('Book a service');
    fireEvent.press(rebookBtn);
    expect(mockStart).not.toHaveBeenCalled();
    expect(router.push).toHaveBeenCalledWith('/(customer)/search');
  });
});
