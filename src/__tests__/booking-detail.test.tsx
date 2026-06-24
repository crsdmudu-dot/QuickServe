/**
 * Tests for src/app/booking/[id].tsx
 *
 * Mocks expo-router (useLocalSearchParams -> {id:'b1'}) and @/lib/bookings
 * and @/lib/photos so no network calls are made.  Uses findBy* to await
 * state settle.
 *
 * Case A: in-app provider (assigned_provider_id set) -> ProfessionalCard shown;
 *         phone NOT rendered.
 * Case B: manual provider (assigned_provider_id null, name set) -> name only shown,
 *         no verified badge, no phone.
 * Case C: no provider assigned -> "No provider assigned yet" shown.
 * Case D: photos section shown with PhotoGallery and upload button.
 */

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ id: 'b1' }),
  router: { push: jest.fn(), replace: jest.fn() },
}));

const mockGetBookingById = jest.fn();
const mockGetBookingProfessional = jest.fn();
const mockGetBookingPhotos = jest.fn();
const mockGetBookingActivity = jest.fn();

jest.mock('@/lib/bookings', () => ({
  getBookingById: (...args: unknown[]) => mockGetBookingById(...args),
  getBookingProfessional: (...args: unknown[]) => mockGetBookingProfessional(...args),
}));

jest.mock('@/lib/photos', () => ({
  getBookingPhotos: (...args: unknown[]) => mockGetBookingPhotos(...args),
  uploadBookingPhoto: jest.fn().mockResolvedValue({ ok: true }),
}));

jest.mock('@/lib/activity', () => ({
  getBookingActivity: (...args: unknown[]) => mockGetBookingActivity(...args),
}));

const mockGetMyReviewForBooking = jest.fn();
const mockSubmitReview = jest.fn();

jest.mock('@/lib/reviews', () => ({
  getMyReviewForBooking: (...args: unknown[]) => mockGetMyReviewForBooking(...args),
  submitReview: (...args: unknown[]) => mockSubmitReview(...args),
}));

jest.mock('@/lib/quotes', () => ({
  acceptQuote: jest.fn().mockResolvedValue({ ok: true }),
  declineQuote: jest.fn().mockResolvedValue({ ok: true }),
}));

const mockGetPaymentForBooking = jest.fn().mockResolvedValue(null);

jest.mock('@/lib/payments', () => ({
  getPaymentForBooking: (...args: unknown[]) => mockGetPaymentForBooking(...args),
}));

const mockInitiateMpesaPayment = jest.fn().mockResolvedValue({ ok: true });
const mockGetPaymentAttempts = jest.fn().mockResolvedValue([]);

jest.mock('@/lib/attempts', () => ({
  initiateMpesaPayment: (...args: unknown[]) => mockInitiateMpesaPayment(...args),
  getPaymentAttempts: (...args: unknown[]) => mockGetPaymentAttempts(...args),
}));

// Mock the PhotoUploadButton so it renders a simple testable placeholder
jest.mock('@/components/ui/photo-upload-button', () => ({
  PhotoUploadButton: ({ label }: { label: string }) => {
    const { Text } = require('react-native');
    return <Text>{label}</Text>;
  },
}));

import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import BookingDetailScreen from '@/app/booking/[id]';

const BASE_BOOKING = {
  id: 'b1',
  service_id: 'house-cleaning',
  address: '123 Main St',
  scheduled_for: '2026-07-01T10:00:00Z',
  notes: 'Ring doorbell',
  status: 'pending' as const,
  assigned_provider_id: null,
  assigned_provider_name: null,
  assigned_provider_phone: null,
  admin_notes: null,
  created_at: '2026-06-21T00:00:00Z',
  quoted_amount: null,
  provider_share: null,
  quote_status: 'pending' as const,
};

describe('BookingDetailScreen', () => {
  beforeEach(() => {
    mockGetBookingById.mockClear();
    mockGetBookingProfessional.mockClear();
    mockGetBookingPhotos.mockResolvedValue([]);
    mockGetBookingActivity.mockResolvedValue([]);
    // Default: no existing review so existing cases keep passing without change.
    mockGetMyReviewForBooking.mockResolvedValue(null);
    mockSubmitReview.mockResolvedValue({ ok: true });
    // Default: no payment for this booking.
    mockGetPaymentForBooking.mockResolvedValue(null);
    // Default: M-Pesa mocks reset.
    mockInitiateMpesaPayment.mockResolvedValue({ ok: true });
    mockGetPaymentAttempts.mockResolvedValue([]);
  });

  it('Case A: in-app provider shows ProfessionalCard; phone is NOT rendered', async () => {
    mockGetBookingById.mockResolvedValue({
      ...BASE_BOOKING,
      status: 'provider_assigned' as const,
      assigned_provider_id: 'p1',
      assigned_provider_name: 'Jane',
      assigned_provider_phone: '0700',
    });

    mockGetBookingProfessional.mockResolvedValue({
      full_name: 'Jane',
      skills: ['Plumbing'],
      is_verified: true,
      completed_jobs_count: 5,
      profile_photo_url: null,
    });

    render(<BookingDetailScreen />);

    expect(await screen.findByText('Jane')).toBeOnTheScreen();
    expect(screen.getByText('Plumbing')).toBeOnTheScreen();
    expect(screen.getByText('Verified by QuickServe')).toBeOnTheScreen();
    expect(screen.getByText('5 jobs completed')).toBeOnTheScreen();
    expect(screen.queryByText('0700')).toBeNull();
  });

  it('Case B: manual provider shows name only; no verified badge and no phone', async () => {
    mockGetBookingById.mockResolvedValue({
      ...BASE_BOOKING,
      status: 'provider_assigned' as const,
      assigned_provider_id: null,
      assigned_provider_name: 'Bob',
      assigned_provider_phone: '0700',
    });

    render(<BookingDetailScreen />);

    expect(await screen.findByText('Bob')).toBeOnTheScreen();
    expect(screen.queryByText('Verified by QuickServe')).toBeNull();
    expect(screen.queryByText('0700')).toBeNull();
  });

  it('Case C: shows "No provider assigned yet" when provider fields are null', async () => {
    mockGetBookingById.mockResolvedValue(BASE_BOOKING);

    render(<BookingDetailScreen />);

    expect(await screen.findByText('No provider assigned yet')).toBeOnTheScreen();
  });

  it('Case D: shows Photos section with gallery and upload button', async () => {
    mockGetBookingById.mockResolvedValue(BASE_BOOKING);
    mockGetBookingPhotos.mockResolvedValue([
      {
        id: 'ph1',
        booking_id: 'b1',
        uploaded_by: 'u1',
        photo_url: 'path/to/photo.jpg',
        photo_type: 'issue',
        caption: null,
        is_verified: false,
        created_at: '2026-06-21T00:00:00Z',
        signedUrl: 'https://example.com/signed-photo.jpg',
      },
    ]);

    render(<BookingDetailScreen />);

    // Wait for booking to load
    await screen.findByText('No provider assigned yet');

    // Upload button label should be present
    expect(screen.getByText('Add issue photos')).toBeOnTheScreen();
  });

  it('Case E: shows activity timeline event message', async () => {
    mockGetBookingById.mockResolvedValue(BASE_BOOKING);
    mockGetBookingActivity.mockResolvedValue([
      {
        id: 'a1',
        booking_id: 'bk1',
        actor_id: null,
        event_type: 'booking_created',
        message: 'Booking created.',
        metadata: null,
        created_at: '2026-07-01T10:00:00Z',
      },
    ]);

    render(<BookingDetailScreen />);

    expect(await screen.findByText('Booking created.')).toBeOnTheScreen();
  });

  it('Case F: completed + assigned_provider_id + no review -> tap star 5 + submit calls submitReview', async () => {
    mockGetBookingById.mockResolvedValue({
      ...BASE_BOOKING,
      status: 'completed' as const,
      assigned_provider_id: 'p1',
    });
    // No existing review initially; after submit return null (form stays).
    mockGetMyReviewForBooking.mockResolvedValue(null);
    mockSubmitReview.mockResolvedValue({ ok: true });

    render(<BookingDetailScreen />);

    // Wait for the review form to appear.
    const star5 = await screen.findByTestId('star-5');
    fireEvent.press(star5);

    const submitBtn = screen.getByText('Submit review');
    fireEvent.press(submitBtn);

    await waitFor(() => {
      expect(mockSubmitReview).toHaveBeenCalledWith({
        bookingId: 'b1',
        providerId: 'p1',
        rating: 5,
        comment: '',
      });
    });
  });

  it('Case G: existing review renders comment and hides submit button', async () => {
    mockGetBookingById.mockResolvedValue({
      ...BASE_BOOKING,
      status: 'completed' as const,
      assigned_provider_id: 'p1',
    });
    mockGetMyReviewForBooking.mockResolvedValue({
      id: 'r1',
      rating: 4,
      comment: 'Good',
      is_hidden: false,
      booking_id: 'b1',
      customer_id: 'c1',
      provider_id: 'p1',
      created_at: '2026-07-01T10:00:00Z',
    });

    render(<BookingDetailScreen />);

    expect(await screen.findByText('Good')).toBeOnTheScreen();
    expect(screen.queryByText('Submit review')).toBeNull();
  });

  it('Case H: non-completed booking shows no review UI (no star-1 testID)', async () => {
    mockGetBookingById.mockResolvedValue({
      ...BASE_BOOKING,
      status: 'provider_assigned' as const,
      assigned_provider_id: null,
    });

    render(<BookingDetailScreen />);

    // Wait for booking to load.
    await screen.findByText('Booking Detail');

    expect(screen.queryByTestId('star-1')).toBeNull();
  });

  it('Case I: completed booking with pending payment shows M-Pesa form and calls initiateMpesaPayment', async () => {
    const pendingPayment = {
      id: 'pay1',
      booking_id: 'b1',
      amount: 1500,
      status: 'pending' as const,
      created_at: '2026-06-21T00:00:00Z',
    };

    mockGetBookingById.mockResolvedValue({
      ...BASE_BOOKING,
      status: 'completed' as const,
      quote_status: 'accepted' as const,
    });
    mockGetPaymentForBooking.mockResolvedValue(pendingPayment);
    mockGetPaymentAttempts.mockResolvedValue([]);

    render(<BookingDetailScreen />);

    // Wait for the M-Pesa form to appear.
    const payBtn = await screen.findByText('Pay with M-Pesa');

    // Type a phone number into the input.
    const phoneInput = screen.getByDisplayValue('');
    fireEvent.changeText(phoneInput, '0712345678');

    // Press pay.
    fireEvent.press(payBtn);

    await waitFor(() => {
      expect(mockInitiateMpesaPayment).toHaveBeenCalledWith(
        expect.objectContaining({ paymentId: 'pay1', phone: '0712345678' }),
      );
    });
  });
});
