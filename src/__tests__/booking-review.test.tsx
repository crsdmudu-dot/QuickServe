/**
 * Tests for src/app/booking/review.tsx
 *
 * We mock expo-router (push/replace), @/booking/booking-draft and
 * @/lib/bookings so no network is touched.
 */

jest.mock('expo-router', () => ({ router: { push: jest.fn(), replace: jest.fn() } }));

const mockReset = jest.fn();
let mockDraft = {
  serviceId: 'house-cleaning',
  address: 'Nairobi',
  scheduledFor: '2026-07-01T10:00:00Z',
  notes: 'Gate code 12',
};
jest.mock('@/booking/booking-draft', () => ({
  useBookingDraft: () => ({ ...mockDraft, reset: mockReset }),
}));

const mockCreateBooking = jest.fn();
jest.mock('@/lib/bookings', () => ({
  createBooking: (...args: unknown[]) => mockCreateBooking(...args),
}));

import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';
import ReviewScreen from '@/app/booking/review';

describe('ReviewScreen', () => {
  beforeEach(() => {
    (router.replace as jest.Mock).mockClear();
    mockReset.mockClear();
    mockCreateBooking.mockReset();
    mockDraft = {
      serviceId: 'house-cleaning',
      address: 'Nairobi',
      scheduledFor: '2026-07-01T10:00:00Z',
      notes: 'Gate code 12',
    };
  });

  it('renders the service, address, formatted date and notes', () => {
    render(<ReviewScreen />);
    expect(screen.getByText('House Cleaning')).toBeOnTheScreen();
    expect(screen.getByText('Nairobi')).toBeOnTheScreen();
    expect(
      screen.getByText(new Date('2026-07-01T10:00:00Z').toLocaleString()),
    ).toBeOnTheScreen();
    expect(screen.getByText('Gate code 12')).toBeOnTheScreen();
  });

  it('places the booking with the draft and navigates to success on ok', async () => {
    mockCreateBooking.mockResolvedValue({ ok: true });
    render(<ReviewScreen />);

    fireEvent.press(screen.getByText('Place Booking'));

    await waitFor(() =>
      expect(mockCreateBooking).toHaveBeenCalledWith({
        serviceId: 'house-cleaning',
        address: 'Nairobi',
        scheduledFor: '2026-07-01T10:00:00Z',
        notes: 'Gate code 12',
      }),
    );
    expect(mockReset).toHaveBeenCalled();
    expect(router.replace).toHaveBeenCalledWith('/booking/success');
  });

  it('shows an error and does not navigate when createBooking fails', async () => {
    mockCreateBooking.mockResolvedValue({
      ok: false,
      error: 'Could not create booking. Please try again.',
    });
    render(<ReviewScreen />);

    fireEvent.press(screen.getByText('Place Booking'));

    expect(
      await screen.findByText('Could not create booking. Please try again.'),
    ).toBeOnTheScreen();
    expect(mockReset).not.toHaveBeenCalled();
    expect(router.replace).not.toHaveBeenCalled();
  });
});
