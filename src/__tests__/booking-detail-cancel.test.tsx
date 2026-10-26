/**
 * Update 74: the booking screen (src/app/booking/[id].tsx) offers Cancel booking or Get help with this
 * booking, hides a cancelled booking's quote, and offers Book again once cancelled. The mocks are the same
 * as booking-detail.test.tsx (copied from it).
 */
import { render, screen, fireEvent } from '@testing-library/react-native';
import { router } from 'expo-router';

import BookingDetailScreen from '@/app/booking/[id]';

// The report panel (F5.1) imports @/lib/moderation, which creates the Supabase client. Mock it so
// this suite needs no Supabase env; the report flow itself is tested in report-form.test.tsx.
jest.mock('@/lib/moderation', () => ({
  REPORT_REASONS: [{ key: 'harassment', label: 'Harassment or bullying' }],
  REPORT_CONFIRMATION: 'Thanks for letting us know. Our team reviews every report within 24 hours.',
  reportContent: jest.fn().mockResolvedValue({ ok: true }),
}));

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ id: 'b1' }),
  router: { push: jest.fn(), replace: jest.fn(), back: jest.fn(), canGoBack: jest.fn(() => true) },
  // Update 74: the screen reloads on focus; a no-op here (the first focus is skipped anyway).
  useFocusEffect: jest.fn(),
}));

// Mock ServicesProvider — booking-detail.tsx uses useServices() for getServiceBySlug
jest.mock('@/services/services-provider', () => {
  const { mockServicesProviderModule } = jest.requireActual('../../test/mock-services');
  return mockServicesProviderModule();
});

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
    const { Text } = jest.requireActual('react-native');
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

describe('BookingDetailScreen — cancellation actions (Update 74)', () => {
  const mockPush = (router as unknown as { push: jest.Mock }).push;
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetBookingPhotos.mockResolvedValue([]);
    mockGetBookingActivity.mockResolvedValue([]);
    mockGetMyReviewForBooking.mockResolvedValue(null);
    mockGetPaymentForBooking.mockResolvedValue(null);
    mockGetPaymentAttempts.mockResolvedValue([]);
  });

  it('a pending booking offers Cancel booking, which opens the confirmation screen', async () => {
    mockGetBookingById.mockResolvedValue(BASE_BOOKING);
    render(<BookingDetailScreen />);
    fireEvent.press(await screen.findByText('Cancel booking'));
    expect(mockPush).toHaveBeenCalledWith('/booking/cancel/b1');
    expect(screen.queryByText('Get help with this booking')).toBeNull();
  });

  it('a booking where work has started offers Get help with this booking instead', async () => {
    mockGetBookingById.mockResolvedValue({ ...BASE_BOOKING, status: 'in_progress', assigned_provider_id: 'p1', assigned_provider_name: 'Pro' });
    mockGetBookingProfessional.mockResolvedValue(null);
    render(<BookingDetailScreen />);
    fireEvent.press(await screen.findByText('Get help with this booking'));
    expect(mockPush).toHaveBeenCalledWith('/booking/help/b1');
    expect(screen.queryByText('Cancel booking')).toBeNull();
  });

  it('a cancelled booking hides a quote that was still sent, and offers Book again', async () => {
    mockGetBookingById.mockResolvedValue({ ...BASE_BOOKING, status: 'cancelled', quote_status: 'sent', quoted_amount: 1500 });
    render(<BookingDetailScreen />);
    expect(await screen.findByText('Book again')).toBeOnTheScreen();
    expect(screen.queryByText('Accept')).toBeNull();
    expect(screen.queryByText('Cancel booking')).toBeNull();
  });

  it('a pending booking with a sent quote still shows the quote (unchanged)', async () => {
    mockGetBookingById.mockResolvedValue({ ...BASE_BOOKING, quote_status: 'sent', quoted_amount: 1500 });
    render(<BookingDetailScreen />);
    expect(await screen.findByText('Accept')).toBeOnTheScreen();
  });
});
