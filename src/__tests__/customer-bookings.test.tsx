/**
 * Tests for src/app/(customer)/bookings.tsx
 *
 * Mocks expo-router and @/lib/bookings so no network calls are made.
 * Uses findBy* to await state settle after getCustomerBookings resolves.
 */

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), replace: jest.fn() },
}));

const mockGetCustomerBookings = jest.fn().mockResolvedValue([
  {
    id: 'b1',
    service_id: 'house-cleaning',
    address: '123 Main St',
    scheduled_for: '2026-07-01T10:00:00Z',
    notes: 'Ring doorbell',
    status: 'pending' as const,
    assigned_provider_name: null,
    assigned_provider_phone: null,
    admin_notes: null,
    created_at: '2026-06-21T00:00:00Z',
  },
]);

jest.mock('@/lib/bookings', () => ({
  getCustomerBookings: (...args: unknown[]) => mockGetCustomerBookings(...args),
}));

import { fireEvent, render, screen } from '@testing-library/react-native';
import { router } from 'expo-router';
import CustomerBookingsScreen from '@/app/(customer)/bookings';

describe('CustomerBookingsScreen', () => {
  beforeEach(() => {
    mockGetCustomerBookings.mockClear();
    (router.push as jest.Mock).mockClear();
  });

  it('renders the status badge label after bookings load', async () => {
    render(<CustomerBookingsScreen />);
    // findByText awaits the async state update from getCustomerBookings
    expect(await screen.findByText('Pending')).toBeOnTheScreen();
  });

  it('navigates to booking detail when a booking card is pressed', async () => {
    render(<CustomerBookingsScreen />);
    // Wait for the card to appear
    const card = await screen.findByText('House Cleaning');
    fireEvent.press(card);
    expect(router.push).toHaveBeenCalledWith('/booking/b1');
  });
});
