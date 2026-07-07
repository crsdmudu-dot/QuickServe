/**
 * Slice 34 tests for src/app/booking/[id].tsx additions.
 *
 * Verifies NEW additions only (does NOT re-test existing pay/wallet/promo/review-submit):
 * - Provider/service summary display
 * - BookingProgressTracker shown
 * - PaymentBreakdownCard shown (from mocked payment)
 * - "View Receipt" button routes to `/booking/receipt?id=`
 * - Edit review affordance shown when review exists + within 24h window (canEditReview=true)
 * - ReviewEditForm rendered when "Edit review" pressed; onSaved calls editReview
 * - Existing pay/promo/wallet buttons still render (unchanged)
 *
 * All new components + libs are mocked so we test only the screen's wiring.
 */

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ id: 'b1' }),
  router: { push: jest.fn(), replace: jest.fn() },
}));

// Mock ServicesProvider — booking/[id].tsx uses useServices() for getServiceBySlug
jest.mock('@/services/services-provider', () => {
  const { mockServicesProviderModule } = require('../../test/mock-services');
  return mockServicesProviderModule();
});

const mockGetBookingById = jest.fn();
const mockGetBookingProfessional = jest.fn();

jest.mock('@/lib/bookings', () => ({
  getBookingById: (...args: unknown[]) => mockGetBookingById(...args),
  getBookingProfessional: (...args: unknown[]) => mockGetBookingProfessional(...args),
}));

jest.mock('@/lib/photos', () => ({
  getBookingPhotos: jest.fn().mockResolvedValue([]),
  uploadBookingPhoto: jest.fn().mockResolvedValue({ ok: true }),
}));

jest.mock('@/lib/activity', () => ({
  getBookingActivity: jest.fn().mockResolvedValue([]),
}));

const mockGetMyReviewForBooking = jest.fn();
const mockSubmitReview = jest.fn().mockResolvedValue({ ok: true });
const mockEditReview = jest.fn().mockResolvedValue({ ok: true });
let mockCanEditReview = true;

jest.mock('@/lib/reviews', () => ({
  getMyReviewForBooking: (...args: unknown[]) => mockGetMyReviewForBooking(...args),
  submitReview: (...args: unknown[]) => mockSubmitReview(...args),
  editReview: (...args: unknown[]) => mockEditReview(...args),
  canEditReview: () => mockCanEditReview,
  REVIEW_TAGS: [
    { key: 'on_time',  label: 'On time',  sentiment: 'positive' },
    { key: 'friendly', label: 'Friendly', sentiment: 'positive' },
    { key: 'late',     label: 'Late',     sentiment: 'negative' },
  ],
}));

jest.mock('@/lib/quotes', () => ({
  acceptQuote: jest.fn().mockResolvedValue({ ok: true }),
  declineQuote: jest.fn().mockResolvedValue({ ok: true }),
}));

const mockGetPaymentForBooking = jest.fn();

jest.mock('@/lib/payments', () => ({
  getPaymentForBooking: (...args: unknown[]) => mockGetPaymentForBooking(...args),
}));

jest.mock('@/lib/wallet', () => ({
  getMyWallet: jest.fn().mockResolvedValue({ balance: 0, id: '', customer_id: '', currency: 'KES', created_at: '', updated_at: '' }),
  applyWalletToPayment: jest.fn().mockResolvedValue({ ok: true }),
  amountDue: (p: { amount: number; wallet_applied?: number; promo_discount?: number }) =>
    Math.max(0, p.amount - (p.wallet_applied ?? 0) - (p.promo_discount ?? 0)),
}));

jest.mock('@/lib/promotions', () => ({
  redeemPromo: jest.fn().mockResolvedValue({ ok: true }),
}));

jest.mock('@/lib/attempts', () => ({
  initiateMpesaPayment: jest.fn().mockResolvedValue({ ok: true }),
  getPaymentAttempts: jest.fn().mockResolvedValue([]),
}));

// buildReceipt is pure — use the real implementation (no Supabase)
jest.mock('@/lib/receipts', () => {
  const actual = jest.requireActual('@/lib/receipts');
  return actual;
});

jest.mock('@/components/ui/photo-upload-button', () => ({
  PhotoUploadButton: ({ label }: { label: string }) => {
    const { Text } = require('react-native');
    return <Text>{label}</Text>;
  },
}));

// Mock BookingProgressTracker
jest.mock('@/components/customer/booking-progress-tracker', () => ({
  BookingProgressTracker: ({ status }: { status: string }) => {
    const { Text } = require('react-native');
    return <Text testID="progress-tracker">{`tracker-${status}`}</Text>;
  },
}));

// Mock PaymentBreakdownCard
jest.mock('@/components/customer/payment-breakdown-card', () => ({
  PaymentBreakdownCard: ({ receipt }: { receipt: { total: number } }) => {
    const { Text } = require('react-native');
    return <Text testID="payment-breakdown-card">{`breakdown-total-${receipt.total}`}</Text>;
  },
}));

// Mock ReviewEditForm
jest.mock('@/components/customer/review-edit-form', () => ({
  ReviewEditForm: ({
    review,
    onSaved,
    onCancel,
  }: {
    review: { id: string };
    onSaved: () => void;
    onCancel?: () => void;
  }) => {
    const { View, Text, TouchableOpacity } = require('react-native');
    return (
      <View testID="review-edit-form">
        <Text>{`editing-review-${review.id}`}</Text>
        <TouchableOpacity testID="save-review-edit" onPress={onSaved}>
          <Text>Save edit</Text>
        </TouchableOpacity>
        {onCancel && (
          <TouchableOpacity testID="cancel-review-edit" onPress={onCancel}>
            <Text>Cancel edit</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  },
}));

import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';
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
  customer_id: 'c1',
  address_label: null,
  latitude: null,
  longitude: null,
  building_name: null,
  floor: null,
  door_number: null,
  landmark: null,
  access_notes: null,
  scheduling_type: 'datetime',
  time_window: null,
  window_start: null,
  window_end: null,
  recurrence: 'one_time',
};

const BASE_PAYMENT = {
  id: 'pay1',
  booking_id: 'b1',
  customer_id: 'c1',
  amount: 1500,
  currency: 'KES',
  status: 'paid' as const,
  provider_share: 1200,
  quickserve_share: 300,
  payment_method: 'mpesa' as const,
  paid_at: '2026-07-01T12:00:00Z',
  created_at: '2026-07-01T11:00:00Z',
  wallet_applied: 0,
  promo_discount: 0,
  promo_code_id: null,
};

describe('BookingDetailScreen — Slice 34 additions', () => {
  beforeEach(() => {
    mockGetBookingById.mockClear();
    mockGetBookingProfessional.mockResolvedValue({
      full_name: 'Test Provider',
      skills: [],
      is_verified: false,
      completed_jobs_count: 0,
      profile_photo_url: null,
    });
    mockGetMyReviewForBooking.mockResolvedValue(null);
    mockGetPaymentForBooking.mockResolvedValue(null);
    mockEditReview.mockResolvedValue({ ok: true });
    mockCanEditReview = true;
  });

  it('shows progress tracker for the booking status', async () => {
    mockGetBookingById.mockResolvedValue({ ...BASE_BOOKING, status: 'in_progress' });
    render(<BookingDetailScreen />);
    expect(await screen.findByTestId('progress-tracker')).toBeOnTheScreen();
    expect(screen.getByText('tracker-in_progress')).toBeOnTheScreen();
  });

  it('shows service summary (icon + title) for known service_id', async () => {
    mockGetBookingById.mockResolvedValue(BASE_BOOKING);
    render(<BookingDetailScreen />);
    // "House Cleaning" appears in both BookingSummaryCard and the service summary row.
    // getAllByText returns all matches; we just need at least one to be present.
    expect(await screen.findAllByText('House Cleaning')).toBeTruthy();
    // The service summary section is identifiable by the subtitle
    expect(screen.getByText('Deep & regular cleaning')).toBeOnTheScreen();
  });

  it('shows PaymentBreakdownCard and View Receipt button when payment exists', async () => {
    mockGetBookingById.mockResolvedValue(BASE_BOOKING);
    mockGetPaymentForBooking.mockResolvedValue(BASE_PAYMENT);
    render(<BookingDetailScreen />);
    expect(await screen.findByTestId('payment-breakdown-card')).toBeOnTheScreen();
    expect(screen.getByText('View Receipt')).toBeOnTheScreen();
  });

  it('does NOT show PaymentBreakdownCard when payment is null', async () => {
    mockGetBookingById.mockResolvedValue(BASE_BOOKING);
    mockGetPaymentForBooking.mockResolvedValue(null);
    render(<BookingDetailScreen />);
    await screen.findByText('Booking Detail');
    expect(screen.queryByTestId('payment-breakdown-card')).toBeNull();
    expect(screen.queryByText('View Receipt')).toBeNull();
  });

  it('View Receipt button routes to /booking/receipt?id=b1', async () => {
    mockGetBookingById.mockResolvedValue(BASE_BOOKING);
    mockGetPaymentForBooking.mockResolvedValue(BASE_PAYMENT);
    render(<BookingDetailScreen />);
    const receiptBtn = await screen.findByText('View Receipt');
    fireEvent.press(receiptBtn);
    expect(router.push).toHaveBeenCalledWith('/booking/receipt?id=b1');
  });

  it('shows Edit review button when review exists and canEditReview=true', async () => {
    mockCanEditReview = true;
    mockGetBookingById.mockResolvedValue({
      ...BASE_BOOKING,
      status: 'completed',
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
      created_at: new Date(Date.now() - 3600_000).toISOString(), // 1h ago — within window
      quality_rating: null,
      punctuality_rating: null,
      communication_rating: null,
      professionalism_rating: null,
      value_rating: null,
      would_recommend: null,
      tags: [],
    });
    render(<BookingDetailScreen />);
    expect(await screen.findByText('Edit review')).toBeOnTheScreen();
  });

  it('does NOT show Edit review button when canEditReview=false', async () => {
    mockCanEditReview = false;
    mockGetBookingById.mockResolvedValue({
      ...BASE_BOOKING,
      status: 'completed',
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
      created_at: new Date(Date.now() - 25 * 3600_000).toISOString(), // 25h ago — outside window
      quality_rating: null,
      punctuality_rating: null,
      communication_rating: null,
      professionalism_rating: null,
      value_rating: null,
      would_recommend: null,
      tags: [],
    });
    render(<BookingDetailScreen />);
    await screen.findByText('Good'); // review card visible
    expect(screen.queryByText('Edit review')).toBeNull();
  });

  it('pressing Edit review shows ReviewEditForm; Cancel hides it', async () => {
    mockCanEditReview = true;
    mockGetBookingById.mockResolvedValue({
      ...BASE_BOOKING,
      status: 'completed',
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
      created_at: new Date(Date.now() - 3600_000).toISOString(),
      quality_rating: null,
      punctuality_rating: null,
      communication_rating: null,
      professionalism_rating: null,
      value_rating: null,
      would_recommend: null,
      tags: [],
    });
    render(<BookingDetailScreen />);
    const editBtn = await screen.findByText('Edit review');
    fireEvent.press(editBtn);
    expect(screen.getByTestId('review-edit-form')).toBeOnTheScreen();
    expect(screen.getByText('editing-review-r1')).toBeOnTheScreen();

    // Cancel hides the form
    fireEvent.press(screen.getByTestId('cancel-review-edit'));
    expect(screen.queryByTestId('review-edit-form')).toBeNull();
  });

  it('ReviewEditForm onSaved reloads review (calls getMyReviewForBooking again)', async () => {
    mockCanEditReview = true;
    mockGetBookingById.mockResolvedValue({
      ...BASE_BOOKING,
      status: 'completed',
      assigned_provider_id: 'p1',
    });
    const review = {
      id: 'r1',
      rating: 4,
      comment: 'Good',
      is_hidden: false,
      booking_id: 'b1',
      customer_id: 'c1',
      provider_id: 'p1',
      created_at: new Date(Date.now() - 3600_000).toISOString(),
      quality_rating: null,
      punctuality_rating: null,
      communication_rating: null,
      professionalism_rating: null,
      value_rating: null,
      would_recommend: null,
      tags: [],
    };
    // First call returns the review; second call (after save) returns updated
    mockGetMyReviewForBooking
      .mockResolvedValueOnce(review)
      .mockResolvedValueOnce({ ...review, comment: 'Updated!' });

    render(<BookingDetailScreen />);
    const editBtn = await screen.findByText('Edit review');
    fireEvent.press(editBtn);
    expect(screen.getByTestId('review-edit-form')).toBeOnTheScreen();

    // Simulate onSaved (our mock calls it)
    fireEvent.press(screen.getByTestId('save-review-edit'));

    await waitFor(() => {
      // getMyReviewForBooking should have been called at least twice (initial + reload)
      expect(mockGetMyReviewForBooking.mock.calls.length).toBeGreaterThanOrEqual(2);
    });
  });

  it('existing pay/promo/wallet buttons still render (unchanged) for pending payment', async () => {
    mockGetBookingById.mockResolvedValue({
      ...BASE_BOOKING,
      status: 'completed',
      quote_status: 'accepted',
    });
    mockGetPaymentForBooking.mockResolvedValue({
      ...BASE_PAYMENT,
      status: 'pending',
      payment_method: null,
      paid_at: null,
      wallet_applied: 0,
      promo_discount: 0,
      promo_code_id: null,
    });
    render(<BookingDetailScreen />);
    expect(await screen.findByText('Pay with M-Pesa')).toBeOnTheScreen();
    expect(screen.getByText('Apply promo')).toBeOnTheScreen();
  });
});
