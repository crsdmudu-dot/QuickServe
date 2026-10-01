/**
 * P7 (update 50) — the M-PESA part of the customer booking detail screen, src/app/booking/[id].tsx.
 *
 * Proves, offline, the app half of certification check Q8 and the app text of Q2:
 *   - one sentence per attempt state (waiting for the PIN with the business name; confirming after
 *     a timeout; the failure reason with "You can try again");
 *   - the Pay form is hidden while an attempt blocks the payment (initiated, pending, timed out);
 *   - after a request the screen refreshes every 5 s until Paid/Failed, and stops after 3 minutes;
 *   - a refresh also happens when the screen regains focus;
 *   - the function's error code picks the text ("payments unavailable", "do not pay again").
 * Everything around the payment block is mocked, as in booking-detail.test.tsx. (babel-jest
 * hoists every jest.mock call above these imports, so the mocks are in place first.)
 */

import { act, fireEvent, render, screen } from '@testing-library/react-native';

import BookingDetailScreen from '@/app/booking/[id]';
import { MPESA_ERROR_TEXTS, PAYMENTS_UNAVAILABLE_TEXT } from '@/lib/mpesa-payment-status';

let mockFocusCallback: (() => void) | null = null;

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ id: 'b1' }),
  // Keep the latest focus callback so a test can "focus" the screen on demand.
  useFocusEffect: (cb: () => void) => {
    mockFocusCallback = cb;
  },
  router: { push: jest.fn(), replace: jest.fn(), back: jest.fn(), canGoBack: jest.fn(() => true) },
}));

jest.mock('@/lib/moderation', () => ({
  REPORT_REASONS: [],
  REPORT_CONFIRMATION: '',
  reportContent: jest.fn().mockResolvedValue({ ok: true }),
}));

jest.mock('@/services/services-provider', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { mockServicesProviderModule } = require('../../test/mock-services');
  return mockServicesProviderModule();
});

const mockGetBookingById = jest.fn();
jest.mock('@/lib/bookings', () => ({
  getBookingById: (...args: unknown[]) => mockGetBookingById(...args),
  getBookingProfessional: jest.fn().mockResolvedValue(null),
}));

jest.mock('@/lib/photos', () => ({
  getBookingPhotos: jest.fn().mockResolvedValue([]),
  uploadBookingPhoto: jest.fn().mockResolvedValue({ ok: true }),
}));

jest.mock('@/lib/activity', () => ({
  getBookingActivity: jest.fn().mockResolvedValue([]),
}));

jest.mock('@/lib/reviews', () => ({
  getMyReviewForBooking: jest.fn().mockResolvedValue(null),
  submitReview: jest.fn().mockResolvedValue({ ok: true }),
  editReview: jest.fn().mockResolvedValue({ ok: true }),
  canEditReview: () => false,
  REVIEW_TAGS: [],
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
  getMyWallet: jest.fn().mockResolvedValue({ balance: 0 }),
  applyWalletToPayment: jest.fn().mockResolvedValue({ ok: true }),
  amountDue: (p: { amount: number; wallet_applied?: number; promo_discount?: number }) =>
    Math.max(0, p.amount - (p.wallet_applied ?? 0) - (p.promo_discount ?? 0)),
}));

jest.mock('@/lib/promotions', () => ({
  redeemPromo: jest.fn().mockResolvedValue({ ok: true }),
}));

const mockInitiateMpesaPayment = jest.fn();
const mockGetPaymentAttempts = jest.fn();
jest.mock('@/lib/attempts', () => ({
  initiateMpesaPayment: (...args: unknown[]) => mockInitiateMpesaPayment(...args),
  getPaymentAttempts: (...args: unknown[]) => mockGetPaymentAttempts(...args),
}));

jest.mock('@/components/ui/photo-upload-button', () => ({ PhotoUploadButton: () => null }));
jest.mock('@/components/customer/booking-progress-tracker', () => ({ BookingProgressTracker: () => null }));
jest.mock('@/components/customer/payment-breakdown-card', () => ({ PaymentBreakdownCard: () => null }));
jest.mock('@/components/customer/review-edit-form', () => ({ ReviewEditForm: () => null }));
jest.mock('@/lib/receipts', () => ({
  buildReceipt: () => ({
    currency: 'KES', status: null, method: null, paidAt: null,
    lines: [], subtotal: 0, walletApplied: 0, promoDiscount: 0, amountDue: 0, total: 0,
  }),
  canDownloadReceipt: false,
}));

// ─── Fixtures ────────────────────────────────────────────────────────────────

const BOOKING = {
  id: 'b1',
  service_id: 'house-cleaning',
  address: '123 Main St',
  scheduled_for: '2026-07-01T10:00:00Z',
  notes: null,
  status: 'completed' as const,
  assigned_provider_id: null,
  assigned_provider_name: null,
  quote_status: 'accepted' as const,
  quoted_amount: 1500,
  scheduling_type: 'datetime',
  time_window: null,
  window_start: null,
  window_end: null,
  recurrence: 'one_time',
};

const PENDING_PAYMENT = { id: 'pay1', booking_id: 'b1', amount: 1500, status: 'pending' as const };
const PAID_PAYMENT = { ...PENDING_PAYMENT, status: 'paid' as const };

function attempt(status: string, extra: Record<string, unknown> = {}) {
  return {
    id: `att-${status}`,
    payment_id: 'pay1',
    provider: 'mpesa',
    status,
    amount: 1500,
    result_code: null,
    result_desc: null,
    created_at: '2026-09-27T10:00:00Z',
    ...extra,
  };
}

const WAITING_TEXT = 'Check your phone and enter your M-PESA PIN. The prompt will show Hired Corp Ltd.';
const CONFIRMING_TEXT = 'We are confirming this payment with M-PESA. Do not pay again; we will update you.';

async function renderScreen() {
  render(<BookingDetailScreen />);
  await screen.findByText('Booking Detail');
  await act(async () => {
    await Promise.resolve();
  });
}

async function pressPay() {
  fireEvent.changeText(screen.getByPlaceholderText('07XX XXX XXX'), '0712345678');
  await act(async () => {
    fireEvent.press(screen.getByText('Pay with M-Pesa'));
  });
}

async function advance(ms: number) {
  await act(async () => {
    await jest.advanceTimersByTimeAsync(ms);
  });
}

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  mockFocusCallback = null;
  mockGetBookingById.mockResolvedValue(BOOKING);
  mockGetPaymentForBooking.mockResolvedValue(PENDING_PAYMENT);
  mockGetPaymentAttempts.mockResolvedValue([]);
  mockInitiateMpesaPayment.mockResolvedValue({ ok: true });
});

afterEach(() => {
  jest.useRealTimers();
});

// ─── Text per state, and Pay hidden while an attempt blocks (Q8) ─────────────

describe('P7 — one sentence per attempt state; Pay hidden while an attempt blocks (Q8)', () => {
  it('pending: "check your phone" with the business name, and no Pay form', async () => {
    mockGetPaymentAttempts.mockResolvedValue([attempt('pending')]);
    await renderScreen();
    expect(screen.getByText(WAITING_TEXT)).toBeTruthy();
    expect(screen.queryByText('Pay with M-Pesa')).toBeNull();
    expect(screen.queryByPlaceholderText('07XX XXX XXX')).toBeNull();
  });

  it('initiated: the same waiting text, and no Pay form', async () => {
    mockGetPaymentAttempts.mockResolvedValue([attempt('initiated')]);
    await renderScreen();
    expect(screen.getByText(WAITING_TEXT)).toBeTruthy();
    expect(screen.queryByText('Pay with M-Pesa')).toBeNull();
  });

  it('timed out: "we are confirming, do not pay again", and no Pay form', async () => {
    mockGetPaymentAttempts.mockResolvedValue([attempt('timed_out')]);
    await renderScreen();
    expect(screen.getByText(CONFIRMING_TEXT)).toBeTruthy();
    expect(screen.queryByText('Pay with M-Pesa')).toBeNull();
  });

  it('failed: the reason and "You can try again", with the Pay form back', async () => {
    mockGetPaymentAttempts.mockResolvedValue([attempt('failed', { result_code: 1032, result_desc: 'Request cancelled by user' })]);
    await renderScreen();
    expect(screen.getByText('The M-PESA request was cancelled. You can try again.')).toBeTruthy();
    expect(screen.getByText('Pay with M-Pesa')).toBeTruthy();
  });

  it('an older blocking attempt still hides Pay even if the newest one failed', async () => {
    mockGetPaymentAttempts.mockResolvedValue([attempt('failed'), attempt('timed_out')]);
    await renderScreen();
    expect(screen.queryByText('Pay with M-Pesa')).toBeNull();
  });

  it('a paid payment shows no waiting or failure sentence', async () => {
    mockGetPaymentForBooking.mockResolvedValue(PAID_PAYMENT);
    mockGetPaymentAttempts.mockResolvedValue([attempt('successful')]);
    await renderScreen();
    expect(screen.queryByTestId('attempt-status-text')).toBeNull();
    expect(screen.queryByText('Pay with M-Pesa')).toBeNull();
  });
});

// ─── Automatic refresh after a request (Q8) ──────────────────────────────────

describe('P7 — refreshes after a payment request until Paid or Failed (Q8)', () => {
  it('pending → paid: shows the waiting text, then Paid after the next 5 s refresh, then stops', async () => {
    await renderScreen();
    mockGetPaymentAttempts.mockResolvedValue([attempt('pending')]);
    await pressPay();

    // The new attempt is shown at once and the Pay form is gone.
    expect(screen.getByText(WAITING_TEXT)).toBeTruthy();
    expect(screen.queryByText('Pay with M-Pesa')).toBeNull();

    // M-PESA settles it; the next refresh shows it without reopening the screen.
    mockGetPaymentForBooking.mockResolvedValue(PAID_PAYMENT);
    mockGetPaymentAttempts.mockResolvedValue([attempt('successful')]);
    await advance(5000);
    expect(screen.getByText('Successful')).toBeTruthy();
    expect(screen.queryByText(WAITING_TEXT)).toBeNull();

    // Finished: no more refreshes.
    const reads = mockGetPaymentForBooking.mock.calls.length;
    await advance(60000);
    expect(mockGetPaymentForBooking.mock.calls.length).toBe(reads);
  });

  it('pending → failed: shows the reason and brings the Pay form back', async () => {
    await renderScreen();
    mockGetPaymentAttempts.mockResolvedValue([attempt('pending')]);
    await pressPay();

    mockGetPaymentAttempts.mockResolvedValue([attempt('failed', { result_code: 1037 })]);
    await advance(5000);
    expect(screen.getByText('The M-PESA request was not answered in time. You can try again.')).toBeTruthy();
    expect(screen.getByText('Pay with M-Pesa')).toBeTruthy();
  });

  it('refreshes about every 5 s and stops after 3 minutes when nothing changes', async () => {
    await renderScreen();
    mockGetPaymentAttempts.mockResolvedValue([attempt('pending')]);
    await pressPay();
    const before = mockGetPaymentForBooking.mock.calls.length;

    await advance(5000);
    expect(mockGetPaymentForBooking.mock.calls.length).toBe(before + 1);
    await advance(5000);
    expect(mockGetPaymentForBooking.mock.calls.length).toBe(before + 2);

    await advance(3 * 60 * 1000);
    const atEnd = mockGetPaymentForBooking.mock.calls.length;
    // 3 minutes at 5 s is 36 refreshes (one may fall either side of the boundary).
    expect(atEnd - before).toBeGreaterThanOrEqual(35);
    expect(atEnd - before).toBeLessThanOrEqual(37);
    await advance(60000);
    expect(mockGetPaymentForBooking.mock.calls.length).toBe(atEnd);
  });

  it('a failed read during the refresh keeps what is on screen and keeps refreshing', async () => {
    await renderScreen();
    mockGetPaymentAttempts.mockResolvedValue([attempt('pending')]);
    await pressPay();

    mockGetPaymentForBooking.mockResolvedValueOnce(null);
    await advance(5000);
    expect(screen.getByText(WAITING_TEXT)).toBeTruthy();

    mockGetPaymentForBooking.mockResolvedValue(PAID_PAYMENT);
    mockGetPaymentAttempts.mockResolvedValue([attempt('successful')]);
    await advance(5000);
    expect(screen.getByText('Successful')).toBeTruthy();
  });
});

// ─── Error codes (Q2) ────────────────────────────────────────────────────────

describe('P7 — the function error code picks the text (Q2)', () => {
  it('payments_unavailable (disabled): the unavailable text, no refresh', async () => {
    await renderScreen();
    mockInitiateMpesaPayment.mockResolvedValue({ ok: false, code: 'payments_unavailable', error: PAYMENTS_UNAVAILABLE_TEXT });
    await pressPay();
    expect(screen.getByText(PAYMENTS_UNAVAILABLE_TEXT)).toBeTruthy();
    const reads = mockGetPaymentForBooking.mock.calls.length;
    await advance(30000);
    expect(mockGetPaymentForBooking.mock.calls.length).toBe(reads);
  });

  it('status_unknown: "do not pay again" stays visible while the blocking attempt hides the Pay form', async () => {
    await renderScreen();
    mockInitiateMpesaPayment.mockResolvedValue({
      ok: false,
      code: 'status_unknown',
      error: MPESA_ERROR_TEXTS.status_unknown,
    });
    mockGetPaymentAttempts.mockResolvedValue([attempt('initiated')]);
    await pressPay();
    expect(screen.getByText(MPESA_ERROR_TEXTS.status_unknown)).toBeTruthy();
    expect(screen.queryByText('Pay with M-Pesa')).toBeNull();

    // When the attempt later fails, the old warning goes and the Pay form comes back.
    mockGetPaymentAttempts.mockResolvedValue([attempt('failed', { result_code: 1032 })]);
    await advance(5000);
    expect(screen.queryByText(MPESA_ERROR_TEXTS.status_unknown)).toBeNull();
    expect(screen.getByText('Pay with M-Pesa')).toBeTruthy();
  });
});

// ─── Focus refresh ───────────────────────────────────────────────────────────

describe('P7 — refresh when the screen regains focus', () => {
  it('skips the first focus, refreshes on the next, and restarts the auto-refresh while waiting', async () => {
    await renderScreen();
    expect(mockFocusCallback).not.toBeNull();

    // The first focus happens on mount and is skipped (the screen just loaded).
    const afterMount = mockGetPaymentForBooking.mock.calls.length;
    await act(async () => {
      mockFocusCallback!();
    });
    expect(mockGetPaymentForBooking.mock.calls.length).toBe(afterMount);

    // Coming back to the screen: a refresh, which finds a pending attempt…
    mockGetPaymentAttempts.mockResolvedValue([attempt('pending')]);
    await act(async () => {
      mockFocusCallback!();
    });
    expect(mockGetPaymentForBooking.mock.calls.length).toBe(afterMount + 1);
    expect(screen.getByText(WAITING_TEXT)).toBeTruthy();

    // …so the 5 s refresh starts again.
    await advance(5000);
    expect(mockGetPaymentForBooking.mock.calls.length).toBe(afterMount + 2);
  });
});
