/**
 * Tests for src/app/booking/track/[id].tsx
 *
 * Mocks:
 *   expo-router            — useLocalSearchParams → { id: 'b1' }; router.push spy
 *   @/lib/bookings         — getBookingById → booking with lat/lng, status on_the_way
 *   @/lib/tracking         — getProviderLocationForBooking → a location or null
 *                            subscribeToProviderLocation → returns a jest.fn() unsub
 *   @/components/ui/tracking-map — lightweight placeholder so no Image/Edge Function call
 *
 * Case A: provider location available → status badge label + distance/ETA text shown.
 * Case B: no provider location (null initial + subscribe never fires) → "Waiting…" message.
 */

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ id: 'b1' }),
  router: { push: jest.fn(), replace: jest.fn() },
}));

// ── @/lib/bookings mock ──────────────────────────────────────────────────────

const mockGetBookingById = jest.fn();

jest.mock('@/lib/bookings', () => ({
  getBookingById: (id: string) => mockGetBookingById(id),
}));

// ── @/lib/tracking mock ──────────────────────────────────────────────────────

const mockGetProviderLocationForBooking = jest.fn();
const mockUnsubscribe = jest.fn();
// subscribeToProviderLocation(bookingId, onUpdate) → unsubscribe fn
const mockSubscribeToProviderLocation = jest.fn(
  (_bookingId: string, _onUpdate: (loc: unknown) => void) => mockUnsubscribe,
);

jest.mock('@/lib/tracking', () => ({
  getProviderLocationForBooking: (bookingId: string) =>
    mockGetProviderLocationForBooking(bookingId),
  subscribeToProviderLocation: (bookingId: string, onUpdate: (loc: unknown) => void) =>
    mockSubscribeToProviderLocation(bookingId, onUpdate),
}));

// ── @/components/ui/tracking-map mock ───────────────────────────────────────
// Replace with a simple testable placeholder — avoids Image/Edge Function calls.

jest.mock('@/components/ui/tracking-map', () => ({
  TrackingMap: ({
    provider,
    customer,
    distanceKm,
  }: {
    provider: { latitude: number; longitude: number } | null;
    customer: { latitude: number; longitude: number };
    distanceKm?: number | null;
    updatedAt?: string | null;
  }) => {
    const { View, Text } = require('react-native');
    return (
      <View>
        <Text testID="mock-tracking-map">
          {provider
            ? `Map: ${provider.latitude},${provider.longitude} → ${customer.latitude},${customer.longitude} (${distanceKm?.toFixed(2)} km)`
            : 'Map: no provider'}
        </Text>
      </View>
    );
  },
}));

import { render, screen, waitFor } from '@testing-library/react-native';
import CustomerTrackScreen from '@/app/booking/track/[id]';

// ── Fixtures ─────────────────────────────────────────────────────────────────

const BASE_BOOKING = {
  id: 'b1',
  service_id: 'house-cleaning',
  address: '123 Main St',
  scheduled_for: '2026-07-01T10:00:00Z',
  notes: 'Ring doorbell',
  status: 'on_the_way' as const,
  assigned_provider_id: 'p1',
  assigned_provider_name: 'Jane',
  assigned_provider_phone: '0700',
  admin_notes: null,
  created_at: '2026-06-21T00:00:00Z',
  quoted_amount: null,
  provider_share: null,
  quote_status: 'accepted' as const,
  // Booking has a customer destination
  latitude: -1.286389,
  longitude: 36.817223,
};

const PROVIDER_LOCATION = {
  booking_id: 'b1',
  provider_id: 'p1',
  latitude: -1.292066,
  longitude: 36.821946,
  heading: null,
  speed: null,
  updated_at: new Date().toISOString(), // fresh timestamp
};

// ── Setup ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  mockGetBookingById.mockClear();
  mockGetProviderLocationForBooking.mockClear();
  mockSubscribeToProviderLocation.mockClear();
  mockUnsubscribe.mockClear();
  // Reset subscribe to always return the unsub fn.
  mockSubscribeToProviderLocation.mockReturnValue(mockUnsubscribe);
});

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('CustomerTrackScreen', () => {
  it('Case A: provider location known → shows status badge and distance/ETA', async () => {
    mockGetBookingById.mockResolvedValue(BASE_BOOKING);
    mockGetProviderLocationForBooking.mockResolvedValue(PROVIDER_LOCATION);

    render(<CustomerTrackScreen />);

    // Status badge: on_the_way with a non-trivial distance (> 0.5 km) → "Heading to you"
    expect(await screen.findByText('Heading to you')).toBeOnTheScreen();

    // Distance + ETA line should appear (the component formats it as "X.X km away · ETA ~Y min")
    // We wait for the async state to settle.
    await waitFor(() => {
      const etaEls = screen.queryAllByText(/away · ETA/);
      expect(etaEls.length).toBeGreaterThan(0);
    });

    // The subscribe function should have been called with the booking id.
    expect(mockSubscribeToProviderLocation).toHaveBeenCalledWith('b1', expect.any(Function));
  });

  it('Case B: no provider location → "Waiting for your provider\'s location…" shown', async () => {
    mockGetBookingById.mockResolvedValue(BASE_BOOKING);
    // Initial fetch returns null; subscribe never fires.
    mockGetProviderLocationForBooking.mockResolvedValue(null);

    render(<CustomerTrackScreen />);

    // Wait for booking to load (title renders when booking is set).
    await screen.findByText('Track your provider');

    // Waiting message should be visible.
    expect(
      screen.getByText(/Waiting for your provider.s location/),
    ).toBeOnTheScreen();

    // Distance/ETA must NOT appear.
    expect(screen.queryAllByText(/away · ETA/).length).toBe(0);
  });

  it('Case C: unsubscribes when unmounted', async () => {
    mockGetBookingById.mockResolvedValue(BASE_BOOKING);
    mockGetProviderLocationForBooking.mockResolvedValue(PROVIDER_LOCATION);

    const { unmount } = render(<CustomerTrackScreen />);

    // Wait for subscription to be set up.
    await screen.findByText('Track your provider');

    unmount();

    // The unsub function should have been called on cleanup.
    expect(mockUnsubscribe).toHaveBeenCalled();
  });
});
