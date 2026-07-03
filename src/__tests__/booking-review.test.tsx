/**
 * Tests for src/app/booking/review.tsx
 *
 * We mock expo-router (push/replace), @/booking/booking-draft, @/lib/bookings
 * and @/lib/photos so no network is touched.
 *
 * Slice 20: mockDraft now includes the structured address fields, and the
 * createBooking assertion is updated additively to include them.
 */

jest.mock('expo-router', () => ({ router: { push: jest.fn(), replace: jest.fn() } }));

const mockReset = jest.fn();
let mockDraft = {
  serviceId: 'house-cleaning',
  address: 'Nairobi',
  scheduledFor: '2026-07-01T10:00:00Z',
  notes: 'Gate code 12',
  issuePhotos: [] as string[],
  // Slice 20 structured address fields
  address_label: '',
  latitude: null as number | null,
  longitude: null as number | null,
  building_name: '',
  floor: '',
  door_number: '',
  landmark: '',
  access_notes: '',
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
      // Slice 20 structured address fields
      address_label: '',
      latitude: null,
      longitude: null,
      building_name: '',
      floor: '',
      door_number: '',
      landmark: '',
      access_notes: '',
    };
  });

  it('renders the service, address, a When label, and notes', () => {
    render(<ReviewScreen />);
    expect(screen.getByText('House Cleaning')).toBeOnTheScreen();
    // Slice 20: address now appears in both DestinationSummary and BookingSummaryCard.
    expect(screen.getAllByText('Nairobi').length).toBeGreaterThan(0);
    // Slice 24: the "Date & time" row is now "When" with a describeSchedule value.
    // We assert the label is present rather than the locale-formatted string.
    expect(screen.getByText('When')).toBeOnTheScreen();
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
        // Slice 20 structured address fields
        address_label: '',
        latitude: undefined,
        longitude: undefined,
        building_name: '',
        floor: '',
        door_number: '',
        landmark: '',
        access_notes: '',
        // Slice 24 scheduling fields (undefined when draft has no scheduling props)
        scheduling_type: undefined,
        time_window: undefined,
        window_start: undefined,
        window_end: undefined,
        recurrence: undefined,
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
