/**
 * Tests for src/app/booking/[id].tsx
 *
 * Mocks expo-router (useLocalSearchParams -> {id:'b1'}) and @/lib/bookings
 * so no network calls are made.  Uses findBy* to await state settle.
 *
 * Case A: booking with assigned provider -> name + phone shown.
 * Case B: booking without assigned provider -> "No provider assigned yet" shown.
 */

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ id: 'b1' }),
  router: { push: jest.fn(), replace: jest.fn() },
}));

const mockGetBookingById = jest.fn();

jest.mock('@/lib/bookings', () => ({
  getBookingById: (...args: unknown[]) => mockGetBookingById(...args),
}));

import { render, screen } from '@testing-library/react-native';
import BookingDetailScreen from '@/app/booking/[id]';

describe('BookingDetailScreen', () => {
  beforeEach(() => {
    mockGetBookingById.mockClear();
  });

  it('Case A: shows provider name and phone when assigned', async () => {
    mockGetBookingById.mockResolvedValue({
      id: 'b1',
      service_id: 'house-cleaning',
      address: '123 Main St',
      scheduled_for: '2026-07-01T10:00:00Z',
      notes: 'Ring doorbell',
      status: 'provider_assigned' as const,
      assigned_provider_name: 'Jane',
      assigned_provider_phone: '0700',
      admin_notes: null,
      created_at: '2026-06-21T00:00:00Z',
    });

    render(<BookingDetailScreen />);

    expect(await screen.findByText('Jane')).toBeOnTheScreen();
    expect(screen.getByText('0700')).toBeOnTheScreen();
  });

  it('Case B: shows "No provider assigned yet" when provider fields are null', async () => {
    mockGetBookingById.mockResolvedValue({
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
    });

    render(<BookingDetailScreen />);

    expect(await screen.findByText('No provider assigned yet')).toBeOnTheScreen();
  });
});
