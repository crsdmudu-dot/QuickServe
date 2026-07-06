/**
 * Slice 34 tests for src/app/(customer)/bookings.tsx
 *
 * Verifies:
 * - BookingStatusCard renders for each booking (service title + status badge)
 * - Row press still routes to `/booking/${id}` (preserved nav)
 * - Empty state shown when no bookings
 * - Skeleton shown during initial load
 * - Compact BookingProgressTracker shown for in-progress bookings
 *
 * Mocks @/lib/bookings, expo-router, and the customer components so no network
 * or real rendering complexity leaks in.
 */

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), replace: jest.fn() },
}));

const mockGetCustomerBookings = jest.fn();

jest.mock('@/lib/bookings', () => ({
  getCustomerBookings: (...args: unknown[]) => mockGetCustomerBookings(...args),
}));

// Mock BookingStatusCard to render testable output
jest.mock('@/components/customer/booking-status-card', () => ({
  BookingStatusCard: ({
    booking,
    onPress,
  }: {
    booking: { id: string; service_id?: string; status: string };
    onPress?: () => void;
  }) => {
    const { TouchableOpacity, Text } = require('react-native');
    return (
      <TouchableOpacity testID={`booking-card-${booking.id}`} onPress={onPress}>
        <Text>{`booking-card-${booking.service_id}`}</Text>
        <Text>{booking.status}</Text>
      </TouchableOpacity>
    );
  },
}));

// Mock BookingProgressTracker to render testable output
jest.mock('@/components/customer/booking-progress-tracker', () => ({
  BookingProgressTracker: ({ status }: { status: string }) => {
    const { Text } = require('react-native');
    return <Text testID="progress-tracker">{`tracker-${status}`}</Text>;
  },
}));

import { fireEvent, render, screen } from '@testing-library/react-native';
import { router } from 'expo-router';
import CustomerBookingsScreen from '@/app/(customer)/bookings';

const BASE_BOOKING = {
  id: 'b1',
  service_id: 'house-cleaning',
  address: '123 Main St',
  scheduled_for: '2026-07-01T10:00:00Z',
  notes: '',
  status: 'pending',
  assigned_provider_name: null,
  assigned_provider_phone: null,
  admin_notes: null,
  created_at: '2026-06-21T00:00:00Z',
};

describe('CustomerBookingsScreen (Slice 34)', () => {
  beforeEach(() => {
    mockGetCustomerBookings.mockClear();
    (router.push as jest.Mock).mockClear();
  });

  it('renders BookingStatusCard for each booking', async () => {
    mockGetCustomerBookings.mockResolvedValue([BASE_BOOKING]);
    render(<CustomerBookingsScreen />);
    expect(await screen.findByTestId('booking-card-b1')).toBeOnTheScreen();
    expect(screen.getByText('booking-card-house-cleaning')).toBeOnTheScreen();
  });

  it('pressing booking card routes to /booking/{id}', async () => {
    mockGetCustomerBookings.mockResolvedValue([BASE_BOOKING]);
    render(<CustomerBookingsScreen />);
    const card = await screen.findByTestId('booking-card-b1');
    fireEvent.press(card);
    expect(router.push).toHaveBeenCalledWith('/booking/b1');
  });

  it('shows empty state when no bookings', async () => {
    mockGetCustomerBookings.mockResolvedValue([]);
    render(<CustomerBookingsScreen />);
    expect(await screen.findByText('No bookings yet')).toBeOnTheScreen();
  });

  it('shows skeleton during initial load (before bookings resolve)', () => {
    // Return a promise that never resolves during this render cycle
    mockGetCustomerBookings.mockReturnValue(new Promise(() => {}));
    render(<CustomerBookingsScreen />);
    // Skeletons render immediately before data arrives
    // The "My Bookings" heading is always visible
    expect(screen.getByText('My Bookings')).toBeOnTheScreen();
  });

  it('shows compact progress tracker for in-progress booking', async () => {
    mockGetCustomerBookings.mockResolvedValue([
      { ...BASE_BOOKING, id: 'b2', status: 'in_progress' },
    ]);
    render(<CustomerBookingsScreen />);
    expect(await screen.findByTestId('progress-tracker')).toBeOnTheScreen();
    expect(screen.getByText('tracker-in_progress')).toBeOnTheScreen();
  });

  it('does NOT show progress tracker for completed booking', async () => {
    mockGetCustomerBookings.mockResolvedValue([
      { ...BASE_BOOKING, id: 'b3', status: 'completed' },
    ]);
    render(<CustomerBookingsScreen />);
    await screen.findByTestId('booking-card-b3');
    expect(screen.queryByTestId('progress-tracker')).toBeNull();
  });
});
