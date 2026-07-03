/**
 * Tests for src/components/ui/admin-live-location.tsx
 *
 * Verifies display-only behavior:
 *   - Active booking with location  → renders badge + last-known caption.
 *   - Active booking without location → "No live location yet." empty state.
 *   - Non-active booking             → renders nothing (null).
 */

// ── Mocks ────────────────────────────────────────────────────────────────────

const mockGetProviderLocationForBooking = jest.fn().mockResolvedValue(null);
const mockSubscribeToProviderLocation = jest.fn().mockReturnValue(jest.fn());

jest.mock('@/lib/tracking', () => ({
  getProviderLocationForBooking: (...args: unknown[]) =>
    mockGetProviderLocationForBooking(...args),
  subscribeToProviderLocation: (...args: unknown[]) =>
    mockSubscribeToProviderLocation(...args),
}));

// TrackingMap calls getTrackingMapUrl (network); keep tests fast + offline-safe.
jest.mock('@/components/ui/tracking-map', () => ({
  TrackingMap: () => null,
}));

// ── Imports ──────────────────────────────────────────────────────────────────

import { render, screen, waitFor } from '@testing-library/react-native';
import { AdminLiveLocation } from '@/components/ui/admin-live-location';
import type { Booking } from '@/lib/bookings';

// ── Fixtures ─────────────────────────────────────────────────────────────────

const BASE_BOOKING: Booking = {
  id: 'b1',
  service_id: 'house-cleaning',
  address: '1 Test St',
  scheduled_for: '2026-07-01T10:00:00Z',
  notes: null,
  status: 'on_the_way',
  customer_id: 'cust1',
  assigned_provider_name: 'Ali',
  assigned_provider_phone: '0700',
  assigned_provider_id: 'prov1',
  admin_notes: null,
  created_at: '2026-07-01T00:00:00Z',
  quoted_amount: null,
  provider_share: null,
  quote_status: 'pending',
  // Slice 20 structured address fields
  address_label: null,
  latitude: -1.286389,
  longitude: 36.817223,
  building_name: null,
  floor: null,
  door_number: null,
  landmark: null,
  access_notes: null,
  // Slice 24 scheduling fields
  scheduling_type: 'datetime',
  time_window: null,
  window_start: null,
  window_end: null,
  recurrence: 'one_time',
};

const MOCK_LOCATION = {
  booking_id: 'b1',
  provider_id: 'prov1',
  latitude: -1.29,
  longitude: 36.82,
  heading: null,
  speed: null,
  updated_at: '2026-07-01T10:05:00Z',
};

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('AdminLiveLocation', () => {
  beforeEach(() => {
    mockGetProviderLocationForBooking.mockClear();
    mockSubscribeToProviderLocation.mockClear();
    mockGetProviderLocationForBooking.mockResolvedValue(null);
    mockSubscribeToProviderLocation.mockReturnValue(jest.fn());
  });

  it('renders nothing for a non-active booking status', () => {
    render(
      <AdminLiveLocation booking={{ ...BASE_BOOKING, status: 'pending' }} />,
    );
    expect(screen.queryByTestId('admin-live-location')).toBeNull();
  });

  it('shows "No live location yet." when active but location is null', async () => {
    mockGetProviderLocationForBooking.mockResolvedValue(null);

    render(<AdminLiveLocation booking={BASE_BOOKING} />);

    expect(await screen.findByTestId('admin-no-location')).toBeOnTheScreen();
    expect(screen.getByTestId('admin-no-location')).toHaveTextContent(
      'No live location yet.',
    );
  });

  it('renders last-known caption when active booking has a location', async () => {
    mockGetProviderLocationForBooking.mockResolvedValue(MOCK_LOCATION);

    render(<AdminLiveLocation booking={BASE_BOOKING} />);

    await waitFor(() => {
      expect(screen.getByTestId('admin-last-known')).toBeOnTheScreen();
    });
    expect(screen.getByTestId('admin-last-known').props.children).toContain(
      'Last known:',
    );
  });

  it('calls subscribeToProviderLocation with the booking id', async () => {
    render(<AdminLiveLocation booking={BASE_BOOKING} />);

    await waitFor(() =>
      expect(mockSubscribeToProviderLocation).toHaveBeenCalledWith(
        'b1',
        expect.any(Function),
      ),
    );
  });

  it('calls the unsub function on unmount', async () => {
    const unsub = jest.fn();
    mockSubscribeToProviderLocation.mockReturnValue(unsub);

    const { unmount } = render(<AdminLiveLocation booking={BASE_BOOKING} />);
    await waitFor(() =>
      expect(mockSubscribeToProviderLocation).toHaveBeenCalled(),
    );

    unmount();
    expect(unsub).toHaveBeenCalled();
  });

  it('works for in_progress status', async () => {
    render(
      <AdminLiveLocation booking={{ ...BASE_BOOKING, status: 'in_progress' }} />,
    );
    // Section should be rendered
    expect(await screen.findByTestId('admin-live-location')).toBeOnTheScreen();
  });
});
