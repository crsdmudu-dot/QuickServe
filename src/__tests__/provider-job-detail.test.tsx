/**
 * Tests for src/app/provider/job/[id].tsx
 *
 * Mocks expo-router, @/lib/bookings so no network calls are made.
 * Uses findBy* for async data loads after getBookingById resolves.
 */

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ id: 'j1' }),
  router: { push: jest.fn() },
}));

// booking state is controlled per test via this variable.
let mockBookingStatus: string = 'provider_assigned';

const mockGetBookingById = jest.fn().mockImplementation(() =>
  Promise.resolve({
    id: 'j1',
    service_id: 'house-cleaning',
    address: '123 Main St',
    scheduled_for: '2026-07-01T10:00:00Z',
    notes: null,
    status: mockBookingStatus,
    created_at: '2026-06-21T00:00:00Z',
    assigned_provider_name: null,
    assigned_provider_phone: null,
    admin_notes: null,
    assigned_provider_id: null,
  }),
);

const mockUpdateBookingStatus = jest.fn().mockResolvedValue({ ok: true });

jest.mock('@/lib/bookings', () => ({
  getBookingById: (...args: unknown[]) => mockGetBookingById(...args),
  updateBookingStatus: (...args: unknown[]) => mockUpdateBookingStatus(...args),
}));

import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import ProviderJobDetailScreen from '@/app/provider/job/[id]';

describe('ProviderJobDetailScreen', () => {
  beforeEach(() => {
    mockGetBookingById.mockClear();
    mockUpdateBookingStatus.mockClear();
  });

  it('shows only "On the way" button for provider_assigned status', async () => {
    mockBookingStatus = 'provider_assigned';
    render(<ProviderJobDetailScreen />);
    // Wait for booking to load
    await screen.findByText('House Cleaning');
    // Only the next-step button should be visible
    expect(screen.getByText('On the way')).toBeOnTheScreen();
    // Should not show In progress (that comes after on_the_way)
    expect(screen.queryByText('In progress')).toBeNull();
  });

  it('calls updateBookingStatus with on_the_way when the button is pressed', async () => {
    mockBookingStatus = 'provider_assigned';
    render(<ProviderJobDetailScreen />);
    await screen.findByText('House Cleaning');
    fireEvent.press(screen.getByText('On the way'));
    await waitFor(() =>
      expect(mockUpdateBookingStatus).toHaveBeenCalledWith('j1', 'on_the_way'),
    );
  });

  it('shows "No further action" and no action button when status is completed', async () => {
    mockBookingStatus = 'completed';
    render(<ProviderJobDetailScreen />);
    await screen.findByText('House Cleaning');
    expect(screen.getByText('No further action')).toBeOnTheScreen();
    // No action buttons should be present
    expect(screen.queryByText('On the way')).toBeNull();
    expect(screen.queryByText('In progress')).toBeNull();
  });
});
