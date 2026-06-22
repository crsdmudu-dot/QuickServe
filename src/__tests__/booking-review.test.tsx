/**
 * Tests for src/app/booking/review.tsx
 *
 * We mock expo-router (push/replace), @/booking/booking-draft, @/lib/bookings
 * and @/lib/photos so no network is touched.
 */

jest.mock('expo-router', () => ({ router: { push: jest.fn(), replace: jest.fn() } }));

const mockReset = jest.fn();
let mockDraft = {
  serviceId: 'house-cleaning',
  address: 'Nairobi',
  scheduledFor: '2026-07-01T10:00:00Z',
  notes: 'Gate code 12',
  issuePhotos: [] as string[],
};
jest.mock('@/booking/booking-draft', () => ({
  useBookingDraft: () => ({ ...mockDraft, reset: mockReset }),
}));

const mockCreateBooking = jest.fn();
jest.mock('@/lib/bookings', () => ({
  createBooking: (...args: unknown[]) => mockCreateBooking(...args),
}));

const mockUploadBookingPhoto = jest.fn();
jest.mock('@/lib/photos', () => ({
  uploadBookingPhoto: (...args: unknown[]) => mockUploadBookingPhoto(...args),
}));

import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';
import ReviewScreen from '@/app/booking/review';

describe('ReviewScreen', () => {
  beforeEach(() => {
    (router.replace as jest.Mock).mockClear();
    mockReset.mockClear();
    mockCreateBooking.mockReset();
    mockUploadBookingPhoto.mockReset();
    mockDraft = {
      serviceId: 'house-cleaning',
      address: 'Nairobi',
      scheduledFor: '2026-07-01T10:00:00Z',
      notes: 'Gate code 12',
      issuePhotos: [],
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

  it('places the booking with the draft and navigates to success on ok (no photos)', async () => {
    mockCreateBooking.mockResolvedValue({ ok: true, id: 'bk1' });
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
    expect(mockUploadBookingPhoto).not.toHaveBeenCalled();
    expect(mockReset).toHaveBeenCalled();
    expect(router.replace).toHaveBeenCalledWith({ pathname: '/booking/success', params: {} });
  });

  it('uploads issuePhotos and navigates to success without warning when all uploads ok', async () => {
    mockDraft.issuePhotos = ['file://a'];
    mockCreateBooking.mockResolvedValue({ ok: true, id: 'bk1' });
    mockUploadBookingPhoto.mockResolvedValue({ ok: true });
    render(<ReviewScreen />);

    fireEvent.press(screen.getByText('Place Booking'));

    await waitFor(() => expect(mockReset).toHaveBeenCalled());
    expect(mockUploadBookingPhoto).toHaveBeenCalledWith({
      bookingId: 'bk1',
      uri: 'file://a',
      photoType: 'issue',
    });
    expect(router.replace).toHaveBeenCalledWith({ pathname: '/booking/success', params: {} });
  });

  it('navigates to success WITH photoWarning when uploadBookingPhoto fails (booking stays created)', async () => {
    mockDraft.issuePhotos = ['file://a'];
    mockCreateBooking.mockResolvedValue({ ok: true, id: 'bk1' });
    mockUploadBookingPhoto.mockResolvedValue({ ok: false });
    render(<ReviewScreen />);

    fireEvent.press(screen.getByText('Place Booking'));

    await waitFor(() => expect(mockReset).toHaveBeenCalled());
    expect(mockCreateBooking).toHaveBeenCalled();
    expect(router.replace).toHaveBeenCalledWith({
      pathname: '/booking/success',
      params: { photoWarning: '1' },
    });
  });

  it('shows an error and does not navigate when createBooking fails', async () => {
    mockDraft.issuePhotos = ['file://a'];
    mockCreateBooking.mockResolvedValue({
      ok: false,
      error: 'Could not create booking. Please try again.',
    });
    render(<ReviewScreen />);

    fireEvent.press(screen.getByText('Place Booking'));

    expect(
      await screen.findByText('Could not create booking. Please try again.'),
    ).toBeOnTheScreen();
    expect(mockUploadBookingPhoto).not.toHaveBeenCalled();
    expect(mockReset).not.toHaveBeenCalled();
    expect(router.replace).not.toHaveBeenCalled();
  });
});
