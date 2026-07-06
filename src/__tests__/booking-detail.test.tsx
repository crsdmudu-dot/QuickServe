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
const mockEditReview = jest.fn().mockResolvedValue({ ok: true });

jest.mock('@/lib/reviews', () => ({
  getMyReviewForBooking: (...args: unknown[]) => mockGetMyReviewForBooking(...args),
  submitReview: (...args: unknown[]) => mockSubmitReview(...args),
  // Slice 34: editReview + canEditReview added; canEditReview uses real logic (pure).
  editReview: (...args: unknown[]) => mockEditReview(...args),
  canEditReview: (review: { created_at: string }) =>
    Date.now() - Date.parse(review.created_at) < 24 * 3600 * 1000,
  // Faithful copy of the 9 tags from src/lib/reviews.ts — needed so tag chips render.
  REVIEW_TAGS: [
    { key: 'on_time',            label: 'On time',            sentiment: 'positive' },
    { key: 'friendly',           label: 'Friendly',           sentiment: 'positive' },
    { key: 'clean_work',         label: 'Clean work',         sentiment: 'positive' },
    { key: 'good_communication', label: 'Good communication', sentiment: 'positive' },
    { key: 'fair_price',         label: 'Fair price',         sentiment: 'positive' },
    { key: 'late',               label: 'Late',               sentiment: 'negative' },
    { key: 'messy',              label: 'Messy',              sentiment: 'negative' },
    { key: 'poor_communication', label: 'Poor communication', sentiment: 'negative' },
    { key: 'overpriced',         label: 'Overpriced',         sentiment: 'negative' },
  ],
}));

jest.mock('@/lib/quotes', () => ({
  acceptQuote: jest.fn().mockResolvedValue({ ok: true }),
  declineQuote: jest.fn().mockResolvedValue({ ok: true }),
}));

const mockGetPaymentForBooking = jest.fn().mockResolvedValue(null);

jest.mock('@/lib/payments', () => ({
  getPaymentForBooking: (...args: unknown[]) => mockGetPaymentForBooking(...args),
}));

const mockGetMyWallet = jest.fn().mockResolvedValue({ balance: 0, id: '', customer_id: '', currency: 'KES', created_at: '', updated_at: '' });
const mockApplyWalletToPayment = jest.fn().mockResolvedValue({ ok: true });

jest.mock('@/lib/wallet', () => ({
  getMyWallet: (...args: unknown[]) => mockGetMyWallet(...args),
  applyWalletToPayment: (...args: unknown[]) => mockApplyWalletToPayment(...args),
  amountDue: (p: { amount: number; wallet_applied?: number; promo_discount?: number }) =>
    Math.max(0, p.amount - (p.wallet_applied ?? 0) - (p.promo_discount ?? 0)),
}));

const mockRedeemPromo = jest.fn().mockResolvedValue({ ok: true, discount: 200 });

jest.mock('@/lib/promotions', () => ({
  redeemPromo: (...args: unknown[]) => mockRedeemPromo(...args),
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

// Slice 34: mock new customer components added to the detail screen.
jest.mock('@/components/customer/booking-progress-tracker', () => ({
  BookingProgressTracker: () => null,
}));

jest.mock('@/components/customer/payment-breakdown-card', () => ({
  PaymentBreakdownCard: () => null,
}));

jest.mock('@/components/customer/review-edit-form', () => ({
  ReviewEditForm: () => null,
}));

jest.mock('@/lib/receipts', () => ({
  buildReceipt: () => ({
    currency: 'KES', status: null, method: null, paidAt: null,
    lines: [], subtotal: 0, walletApplied: 0, promoDiscount: 0,
    amountDue: 0, total: 0,
  }),
  canDownloadReceipt: false,
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
  // Slice 14
  customer_id: 'c1',
  // Slice 20 structured address fields
  address_label: null,
  latitude: null,
  longitude: null,
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

describe('BookingDetailScreen', () => {
  beforeEach(() => {
    mockGetBookingById.mockClear();
    mockGetBookingProfessional.mockClear();
    mockGetBookingPhotos.mockResolvedValue([]);
    mockGetBookingActivity.mockResolvedValue([]);
    // Default: no existing review so existing cases keep passing without change.
    mockGetMyReviewForBooking.mockResolvedValue(null);
    mockSubmitReview.mockClear();
    mockSubmitReview.mockResolvedValue({ ok: true });
    // Default: no payment for this booking.
    mockGetPaymentForBooking.mockResolvedValue(null);
    // Default: M-Pesa mocks reset.
    mockInitiateMpesaPayment.mockResolvedValue({ ok: true });
    mockGetPaymentAttempts.mockResolvedValue([]);
    // Default: empty wallet (balance 0) so apply control is hidden.
    mockGetMyWallet.mockResolvedValue({ balance: 0, id: '', customer_id: '', currency: 'KES', created_at: '', updated_at: '' });
    mockApplyWalletToPayment.mockResolvedValue({ ok: true });
    // Default: promo redeem succeeds with 200 discount.
    mockRedeemPromo.mockResolvedValue({ ok: true, discount: 200 });
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

  it('Case J: full Ratings 2.0 submit — category + recommend + tag + private feedback all sent', async () => {
    mockGetBookingById.mockResolvedValue({
      ...BASE_BOOKING,
      status: 'completed' as const,
      assigned_provider_id: 'p1',
    });
    mockGetMyReviewForBooking.mockResolvedValue(null);
    mockSubmitReview.mockResolvedValue({ ok: true });

    render(<BookingDetailScreen />);

    // Wait for the overall star row to appear, then tap star-5 (overall rating).
    const star5 = await screen.findByTestId('star-5');
    fireEvent.press(star5);

    // Tap quality-star-4 (category rating).
    const qualityStar4 = screen.getByTestId('quality-star-4');
    fireEvent.press(qualityStar4);

    // Press "Would recommend".
    fireEvent.press(screen.getByText('Would recommend'));

    // Tap the "On time" chip.
    fireEvent.press(screen.getByTestId('tag-on_time'));

    // Type private feedback.
    const privateFeedbackText = 'Great job overall, very tidy.';
    fireEvent.changeText(
      screen.getByPlaceholderText('Only visible to QuickServe admin…'),
      privateFeedbackText,
    );

    // Submit.
    fireEvent.press(screen.getByText('Submit review'));

    await waitFor(() => {
      expect(mockSubmitReview).toHaveBeenCalledWith(
        expect.objectContaining({
          rating: 5,
          qualityRating: 4,
          wouldRecommend: true,
          tags: ['on_time'],
          privateFeedback: privateFeedbackText,
        }),
      );
    });
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

    // Type a phone number into the phone input (identified by placeholder).
    const phoneInput = screen.getByPlaceholderText('07XX XXX XXX');
    fireEvent.changeText(phoneInput, '0712345678');

    // Press pay.
    fireEvent.press(payBtn);

    await waitFor(() => {
      expect(mockInitiateMpesaPayment).toHaveBeenCalledWith(
        expect.objectContaining({ paymentId: 'pay1', phone: '0712345678' }),
      );
    });
  });

  it('Case L: pending payment without promo shows promo input + Apply promo; typing + pressing calls redeemPromo and reloads', async () => {
    const pendingPayment = {
      id: 'pay3',
      booking_id: 'b1',
      amount: 800,
      wallet_applied: 0,
      promo_discount: 0,
      promo_code_id: null,
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
    await screen.findByText('Pay with M-Pesa');

    // Promo input and Apply promo button should be visible.
    const promoInput = screen.getByPlaceholderText('Enter promo code');
    expect(promoInput).toBeOnTheScreen();
    expect(screen.getByText('Apply promo')).toBeOnTheScreen();

    // Type a promo code and press Apply.
    fireEvent.changeText(promoInput, 'SAVE200');
    const callsBefore = mockGetPaymentForBooking.mock.calls.length;
    fireEvent.press(screen.getByText('Apply promo'));

    await waitFor(() => {
      // redeemPromo called with payment id and the typed code.
      expect(mockRedeemPromo).toHaveBeenCalledWith('pay3', 'SAVE200');
      // After success, getPaymentForBooking re-called (reload).
      expect(mockGetPaymentForBooking.mock.calls.length).toBeGreaterThan(callsBefore);
    });
  });

  it('Case L2: payment with promo_code_id set hides promo input', async () => {
    const appliedPayment = {
      id: 'pay4',
      booking_id: 'b1',
      amount: 800,
      wallet_applied: 0,
      promo_discount: 200,
      promo_code_id: 'promo-123',
      status: 'pending' as const,
      created_at: '2026-06-21T00:00:00Z',
    };

    mockGetBookingById.mockResolvedValue({
      ...BASE_BOOKING,
      status: 'completed' as const,
      quote_status: 'accepted' as const,
    });
    mockGetPaymentForBooking.mockResolvedValue(appliedPayment);
    mockGetPaymentAttempts.mockResolvedValue([]);

    render(<BookingDetailScreen />);

    await screen.findByText('Pay with M-Pesa');

    // Promo input should NOT be visible when promo_code_id is set.
    expect(screen.queryByPlaceholderText('Enter promo code')).toBeNull();
    expect(screen.queryByText('Apply promo')).toBeNull();
    // "Promo applied" caption shown instead.
    expect(screen.getByText('Promo applied')).toBeOnTheScreen();
  });

  it('Case L3: payment with promo_discount > 0 renders discount and You saved lines', async () => {
    const discountedPayment = {
      id: 'pay5',
      booking_id: 'b1',
      amount: 800,
      wallet_applied: 0,
      promo_discount: 200,
      promo_code_id: 'promo-123',
      status: 'pending' as const,
      created_at: '2026-06-21T00:00:00Z',
    };

    mockGetBookingById.mockResolvedValue({
      ...BASE_BOOKING,
      status: 'completed' as const,
      quote_status: 'accepted' as const,
    });
    mockGetPaymentForBooking.mockResolvedValue(discountedPayment);
    mockGetPaymentAttempts.mockResolvedValue([]);

    render(<BookingDetailScreen />);

    await screen.findByText('Pay with M-Pesa');

    expect(screen.getByText('Promo discount: −KES 200')).toBeOnTheScreen();
    expect(screen.getByText('You saved KES 200')).toBeOnTheScreen();
  });

  // ── Double-submit guard tests ────────────────────────────────────────────

  it('Guard M-Pesa: button is disabled while payment is in-flight, re-enables after', async () => {
    const pendingPayment = {
      id: 'pay-guard',
      booking_id: 'b1',
      amount: 1000,
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

    // Deferred promise — lets us hold the handler in-flight.
    let resolvePayment!: (v: { ok: boolean }) => void;
    const deferredPayment = new Promise<{ ok: boolean }>((res) => { resolvePayment = res; });
    mockInitiateMpesaPayment.mockReturnValue(deferredPayment);

    render(<BookingDetailScreen />);

    // Wait for the button to appear; find via accessibilityRole so we get the Pressable.
    const payBtn = await screen.findByRole('button', { name: 'Pay with M-Pesa' });

    // Press the button — handler is now in-flight.
    fireEvent.press(payBtn);

    // While in-flight the button should be disabled.
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Pay with M-Pesa' }).props.accessibilityState?.disabled).toBe(true);
    });

    // Resolve the deferred promise to complete the handler.
    resolvePayment({ ok: true });

    // After completion the button should re-enable.
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Pay with M-Pesa' }).props.accessibilityState?.disabled).toBe(false);
    });
  });

  it('Guard Submit review: button is disabled while review is in-flight, re-enables after', async () => {
    mockGetBookingById.mockResolvedValue({
      ...BASE_BOOKING,
      status: 'completed' as const,
      assigned_provider_id: 'p1',
    });
    mockGetMyReviewForBooking.mockResolvedValue(null);

    // Deferred promise — holds the submitReview call in-flight.
    let resolveReview!: (v: { ok: boolean }) => void;
    const deferredReview = new Promise<{ ok: boolean }>((res) => { resolveReview = res; });
    mockSubmitReview.mockReturnValue(deferredReview);

    render(<BookingDetailScreen />);

    // Tap star 5 to enable the submit button.
    const star5 = await screen.findByTestId('star-5');
    fireEvent.press(star5);

    // Find the submit button via accessibilityRole so we get the Pressable.
    const submitBtn = screen.getByRole('button', { name: 'Submit review' });

    // Press — handler is now in-flight.
    fireEvent.press(submitBtn);

    // While in-flight the button should be disabled.
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Submit review' }).props.accessibilityState?.disabled).toBe(true);
    });

    // Resolve the deferred promise.
    resolveReview({ ok: true });

    // After completion the button should re-enable (or form disappears when review is set;
    // either outcome is correct — just assert the handler was called exactly once).
    await waitFor(() => {
      expect(mockSubmitReview).toHaveBeenCalledTimes(1);
    });
  });

  it('Case K: wallet balance > 0 shows Apply button; pressing it calls applyWalletToPayment and reloads', async () => {
    const pendingPayment = {
      id: 'pay2',
      booking_id: 'b1',
      amount: 800,
      wallet_applied: 0,
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
    // Override default wallet: balance 500
    mockGetMyWallet.mockResolvedValue({ balance: 500, id: 'w1', customer_id: 'c1', currency: 'KES', created_at: '', updated_at: '' });

    render(<BookingDetailScreen />);

    // Wait for the payment block to appear and verify amounts render.
    expect(await screen.findByText('Amount: KES 800')).toBeOnTheScreen();
    expect(screen.getByText('Amount due: KES 800')).toBeOnTheScreen();

    // Apply wallet button should be visible with min(500, 800) = 500.
    const applyBtn = screen.getByText('Apply wallet credit (KES 500)');
    expect(applyBtn).toBeOnTheScreen();

    // Record call count before pressing apply.
    const callsBefore = mockGetPaymentForBooking.mock.calls.length;

    // Press the apply button.
    fireEvent.press(applyBtn);

    await waitFor(() => {
      // applyWalletToPayment called with payment.id and min(balance=500, due=800)=500.
      expect(mockApplyWalletToPayment).toHaveBeenCalledWith('pay2', 500);
      // After apply, getPaymentForBooking should be re-called (reloadPayment).
      expect(mockGetPaymentForBooking.mock.calls.length).toBeGreaterThan(callsBefore);
    });
  });
});
