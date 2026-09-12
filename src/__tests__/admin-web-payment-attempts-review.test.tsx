/**
 * Tests for src/app/(admin-web)/payment-attempts/index.tsx — M-PESA reconciliation queue.
 *
 * The screen reads the 0053 review RPC (category/urgency/blocking derived in SQL) and exposes
 * only the two protected 0045 RPCs. Financially sensitive actions must be deliberate:
 *   - "Confirm collected" needs an evidence form AND an explicit second confirmation that shows
 *     the attempt/payment identity, the expected amount, the entered reference, and states that
 *     the payment will be settled;
 *   - "No collection" needs a note plus a provider reference or an explicit portal-verified
 *     declaration.
 * There is no generic "Mark paid" control and no free-form payment status editing.
 */

const mockReview = jest.fn();
const mockConfirm = jest.fn();
const mockReconcile = jest.fn();
const mockReviewDiscrepancy = jest.fn();
const mockOrphans = jest.fn();
const mockReviewOrphan = jest.fn();

// The real mpesa-ops module imports the Supabase client; stub it so requireActual is env-free.
jest.mock('@/lib/supabase', () => ({ supabase: { rpc: jest.fn() } }));
jest.mock('@/lib/attempts', () => ({
  adminConfirmAttempt: (...a: unknown[]) => mockConfirm(...a),
  adminReconcileAttemptNoCollection: (...a: unknown[]) => mockReconcile(...a),
}));
jest.mock('@/lib/mpesa-ops', () => {
  const actual = jest.requireActual('@/lib/mpesa-ops');
  return {
    ...actual,
    adminGetMpesaAttemptReview: (...a: unknown[]) => mockReview(...a),
    adminReviewAttemptDiscrepancy: (...a: unknown[]) => mockReviewDiscrepancy(...a),
    adminGetMpesaCallbackEvents: (...a: unknown[]) => mockOrphans(...a),
    adminReviewMpesaCallbackEvent: (...a: unknown[]) => mockReviewOrphan(...a),
  };
});

import { fireEvent, render, screen, waitFor, within } from '@testing-library/react-native';
import AdminWebPaymentAttemptsScreen from '@/app/(admin-web)/payment-attempts/index';

const BASE = {
  payment_id: 'pay-11111111-aaaa',
  booking_id: 'bkg-22222222-bbbb',
  amount: 1500,
  created_at: '2026-09-11T15:53:18Z',
  callback_received_at: null,
  result_code: null,
  result_desc: null,
  checkout_request_id: 'ws_CO_1',
  merchant_request_id: 'mr-1',
  has_collected_amount: false,
  has_settlement_reference: false,
  discrepancy_count: 0,
  latest_discrepancy_type: null,
  discrepancy_unresolved: false,
  discrepancy_reviewed_at: null,
  payment_status: 'pending' as const,
  resolved_at: null,
  resolved_by_present: false,
  resolution_note: null,
  resolution_reference: null,
  phone_masked: '***399',
};

const TIMED_OUT = {
  ...BASE,
  attempt_id: 'att-timedout-0001',
  status: 'timed_out' as const,
  age_seconds: 1500,
  blocks_retry: true,
  needs_operator: true,
  category: 'reconcile' as const,
  urgency: 'due' as const,
};
const WAITING = {
  ...BASE,
  attempt_id: 'att-waiting-0002',
  status: 'pending' as const,
  age_seconds: 40,
  blocks_retry: true,
  needs_operator: false,
  category: 'waiting' as const,
  urgency: 'normal' as const,
};
const SETTLED = {
  ...BASE,
  attempt_id: 'att-settled-0003',
  status: 'successful' as const,
  age_seconds: 99999,
  callback_received_at: '2026-09-11T17:38:45Z',
  result_code: 0,
  result_desc: 'The service request is processed successfully.',
  has_collected_amount: true,
  has_settlement_reference: true,
  payment_status: 'paid' as const,
  blocks_retry: false,
  needs_operator: false,
  category: 'settled' as const,
  urgency: 'normal' as const,
};
const INVESTIGATE = {
  ...BASE,
  attempt_id: 'att-invest-0004',
  status: 'pending' as const,
  age_seconds: 200,
  callback_received_at: '2026-09-11T15:54:00Z',
  result_code: 0,
  result_desc: 'The service request is processed successfully.',
  discrepancy_count: 1,
  latest_discrepancy_type: 'amount_mismatch',
  discrepancy_unresolved: true,
  blocks_retry: true,
  needs_operator: true,
  category: 'investigate' as const,
  urgency: 'due' as const,
};

/** Settled by callback, then a conflicting late callback was refused and recorded (0050). */
const SETTLED_WITH_CONFLICT = {
  ...SETTLED,
  attempt_id: 'att-settled-conflict-0005',
  discrepancy_count: 1,
  latest_discrepancy_type: 'conflicting_callback_after_settlement',
  discrepancy_unresolved: true,
  needs_operator: true,
  category: 'investigate' as const,
  urgency: 'due' as const,
};

/** 0054: authenticated callbacks that matched no attempt — evidence, never payments. */
const ORPHAN_SUCCESS = {
  event_id: 'ev-orphan-success-0001',
  classification: 'unknown_checkout_request_id' as const,
  first_seen_at: '2026-09-12T00:10:00Z',
  last_seen_at: '2026-09-12T00:12:00Z',
  age_seconds: 600,
  seen_count: 2,
  merchant_request_id: 'mr-orphan-1',
  checkout_request_id: 'ws_CO_orphan_1',
  result_code: 0,
  result_desc: 'The service request is processed successfully.',
  amount: 1500,
  receipt: 'SYNTHRCPT01',
  transaction_date: '20260912001000',
  phone_masked: '***399',
  matched_attempt_id: null,
  matched_attempt_status: null,
  matched_payment_id: null,
  urgency: 'high' as const,
  needs_review: true,
  reviewed_at: null,
  reviewed_by_present: false,
  review_note: null,
};
const ORPHAN_MATCHED_LATER = {
  ...ORPHAN_SUCCESS,
  event_id: 'ev-orphan-matched-0002',
  checkout_request_id: 'ws_CO_1',
  result_code: 1032,
  result_desc: 'Request Cancelled by user.',
  amount: null,
  receipt: null,
  matched_attempt_id: 'att-timedout-0001',
  matched_attempt_status: 'timed_out',
  matched_payment_id: 'pay-11111111-aaaa',
  urgency: 'normal' as const,
  seen_count: 1,
};

beforeEach(() => {
  jest.clearAllMocks();
  mockReview.mockResolvedValue([TIMED_OUT, WAITING, SETTLED, INVESTIGATE, SETTLED_WITH_CONFLICT]);
  mockOrphans.mockResolvedValue([ORPHAN_SUCCESS, ORPHAN_MATCHED_LATER]);
  mockConfirm.mockResolvedValue({ ok: true });
  mockReconcile.mockResolvedValue({ ok: true });
  mockReviewDiscrepancy.mockResolvedValue({ ok: true });
  mockReviewOrphan.mockResolvedValue({ ok: true });
});

describe('unmatched M-PESA callback evidence (0054)', () => {
  it('renders orphan evidence in its own clearly labelled section, distinct from attempts', async () => {
    render(<AdminWebPaymentAttemptsScreen />);
    expect(await screen.findByText('Unmatched M-PESA callback evidence')).toBeOnTheScreen();
    const row = within(screen.getByTestId('orphan-row-ev-orphan-success-0001'));
    expect(row.getByText(/unknown_checkout_request_id/)).toBeOnTheScreen();
    expect(row.getByText(/ws_CO_orphan_1/)).toBeOnTheScreen();
    expect(row.getByText(/ResultCode 0/)).toBeOnTheScreen();
    expect(row.getByText(/KES 1,500/)).toBeOnTheScreen();
    expect(row.getByText(/delivered 2×/)).toBeOnTheScreen();
    expect(row.getByText(/\*\*\*399/)).toBeOnTheScreen();
    expect(row.getByText(/High urgency/)).toBeOnTheScreen();
    expect(screen.queryByText(/254\d{9}/)).toBeNull();
  });

  it('offers no settle/confirm/mark-paid control on an orphan and guides to the matching attempt when one exists', async () => {
    render(<AdminWebPaymentAttemptsScreen />);
    await screen.findByText('Unmatched M-PESA callback evidence');
    const success = within(screen.getByTestId('orphan-row-ev-orphan-success-0001'));
    expect(success.queryByText(/confirm|settle|mark paid/i)).toBeNull();
    expect(success.getByText(/No attempt matches this CheckoutRequestID/)).toBeOnTheScreen();
    const matched = within(screen.getByTestId('orphan-row-ev-orphan-matched-0002'));
    expect(matched.getByText(/Exact attempt match: att-time/)).toBeOnTheScreen();
    expect(matched.getByText(/use the attempt's reconciliation workflow/i)).toBeOnTheScreen();
    expect(matched.queryByText(/confirm|settle|mark paid/i)).toBeNull();
  });

  it('records an orphan review through its own RPC with a mandatory note, and never a money-moving call', async () => {
    render(<AdminWebPaymentAttemptsScreen />);
    await screen.findByText('Unmatched M-PESA callback evidence');
    fireEvent.press(screen.getByTestId('review-orphan-ev-orphan-success-0001'));
    fireEvent.press(screen.getByText('Submit orphan review'));
    expect(await screen.findByText('Review note is required.')).toBeOnTheScreen();
    expect(mockReviewOrphan).not.toHaveBeenCalled();
    fireEvent.changeText(screen.getByTestId('orphan-review-note'), 'Portal shows no transaction for this CheckoutRequestID; treated as spurious');
    fireEvent.press(screen.getByText('Submit orphan review'));
    await waitFor(() =>
      expect(mockReviewOrphan).toHaveBeenCalledWith('ev-orphan-success-0001', 'Portal shows no transaction for this CheckoutRequestID; treated as spurious'),
    );
    expect(mockConfirm).not.toHaveBeenCalled();
    expect(mockReconcile).not.toHaveBeenCalled();
  });
});

describe('contradictory evidence on a settled attempt', () => {
  it('stays in the default needs-operator queue even though the payment is paid', async () => {
    render(<AdminWebPaymentAttemptsScreen />);
    await screen.findByText('Reconciliation required');
    const row = within(screen.getByTestId('review-row-att-settled-conflict-0005'));
    expect(row.getByText('Investigate discrepancy')).toBeOnTheScreen();
    expect(row.getByText(/conflicting_callback_after_settlement/)).toBeOnTheScreen();
    // a clean settled attempt is NOT in the default queue
    expect(screen.queryByTestId('review-row-att-settled-0003')).toBeNull();
  });

  it('offers only "Mark discrepancy reviewed" for a settled attempt — never the money-moving actions', async () => {
    render(<AdminWebPaymentAttemptsScreen />);
    await screen.findByText('Reconciliation required');
    expect(screen.getByTestId('review-discrepancy-att-settled-conflict-0005')).toBeOnTheScreen();
    expect(screen.queryByTestId('confirm-att-settled-conflict-0005')).toBeNull();
    expect(screen.queryByTestId('nocollect-att-settled-conflict-0005')).toBeNull();
  });

  it('records the review through its own RPC with a mandatory note, and never mutates the payment', async () => {
    render(<AdminWebPaymentAttemptsScreen />);
    await screen.findByText('Reconciliation required');
    fireEvent.press(screen.getByTestId('review-discrepancy-att-settled-conflict-0005'));
    fireEvent.press(screen.getByText('Submit review'));
    expect(await screen.findByText('Review note is required.')).toBeOnTheScreen();
    expect(mockReviewDiscrepancy).not.toHaveBeenCalled();

    fireEvent.changeText(screen.getByTestId('discrepancy-review-note'), 'Portal confirms the original receipt; late callback was a duplicate notification');
    fireEvent.press(screen.getByText('Submit review'));
    await waitFor(() =>
      expect(mockReviewDiscrepancy).toHaveBeenCalledWith(
        'att-settled-conflict-0005',
        'Portal confirms the original receipt; late callback was a duplicate notification',
      ),
    );
    expect(mockConfirm).not.toHaveBeenCalled();
    expect(mockReconcile).not.toHaveBeenCalled();
  });
});

describe('reconciliation queue', () => {
  it('shows only attempts that need an operator by default, and all on demand', async () => {
    render(<AdminWebPaymentAttemptsScreen />);
    await screen.findByText('Reconciliation required');
    // two investigate rows: the pending amount-mismatch one and the settled-with-conflict one
    expect(screen.getAllByText('Investigate discrepancy')).toHaveLength(2);
    expect(screen.queryByText('Waiting for callback')).toBeNull();
    expect(screen.queryByText('Settled')).toBeNull();

    fireEvent.press(screen.getByText('Show all'));
    expect(await screen.findByText('Waiting for callback')).toBeOnTheScreen();
    expect(screen.getByText('Settled')).toBeOnTheScreen();
  });

  it('masks the phone, shows age and whether retry is blocked, and never renders a raw MSISDN', async () => {
    render(<AdminWebPaymentAttemptsScreen />);
    await screen.findByText('Reconciliation required');
    expect(screen.getAllByText('***399').length).toBeGreaterThan(0);
    expect(screen.queryByText(/254\d{9}/)).toBeNull();
    const row = within(screen.getByTestId('review-row-att-timedout-0001'));
    expect(row.getByText(/Retry blocked/)).toBeOnTheScreen();
    expect(row.getByText(/25 min/)).toBeOnTheScreen();
  });

  it('shows the discrepancy type for an attempt under investigation', async () => {
    render(<AdminWebPaymentAttemptsScreen />);
    await screen.findAllByText('Investigate discrepancy');
    const row = within(screen.getByTestId('review-row-att-invest-0004'));
    expect(row.getByText(/amount_mismatch/)).toBeOnTheScreen();
  });

  it('offers no generic mark-paid control and no payment status editor', async () => {
    render(<AdminWebPaymentAttemptsScreen />);
    await screen.findByText('Reconciliation required');
    fireEvent.press(screen.getByText('Show all'));
    await screen.findByText('Settled');
    expect(screen.queryByText(/mark paid/i)).toBeNull();
    expect(screen.queryByText(/override/i)).toBeNull();
  });
});

describe('confirm collected — deliberate two-step', () => {
  it('requires evidence, then an explicit confirmation naming identity, amount and reference before the RPC', async () => {
    render(<AdminWebPaymentAttemptsScreen />);
    await screen.findByText('Reconciliation required');
    fireEvent.press(screen.getByTestId('confirm-att-timedout-0001'));
    expect(mockConfirm).not.toHaveBeenCalled();

    fireEvent.changeText(screen.getByTestId('resolution-note'), 'Receipt seen in Safaricom portal');
    fireEvent.changeText(screen.getByTestId('resolution-reference'), 'SYNTHETIC00');
    fireEvent.press(screen.getByText('Review confirmation'));

    // Second step: the summary must show what is about to happen, and nothing has been sent yet.
    const review = within(await screen.findByTestId('confirm-review'));
    expect(review.getByText(/att-time/)).toBeOnTheScreen();
    expect(review.getByText(/pay-1111/)).toBeOnTheScreen();
    expect(review.getByText('KES 1,500')).toBeOnTheScreen();
    expect(review.getByText(/SYNTHETIC00/)).toBeOnTheScreen();
    expect(review.getByText(/will settle the payment/i)).toBeOnTheScreen();
    expect(mockConfirm).not.toHaveBeenCalled();

    fireEvent.press(screen.getByText('Yes, settle this payment'));
    await waitFor(() =>
      expect(mockConfirm).toHaveBeenCalledWith(
        'att-timedout-0001',
        1500,
        'Receipt seen in Safaricom portal',
        'SYNTHETIC00',
      ),
    );
    expect(mockConfirm).toHaveBeenCalledTimes(1);
  });

  it('will not open the confirmation step without a transaction reference for M-PESA', async () => {
    render(<AdminWebPaymentAttemptsScreen />);
    await screen.findByText('Reconciliation required');
    fireEvent.press(screen.getByTestId('confirm-att-timedout-0001'));
    fireEvent.changeText(screen.getByTestId('resolution-note'), 'Portal receipt');
    fireEvent.press(screen.getByText('Review confirmation'));
    expect(await screen.findByText('Transaction reference is required for this provider.')).toBeOnTheScreen();
    expect(screen.queryByTestId('confirm-review')).toBeNull();
    expect(mockConfirm).not.toHaveBeenCalled();
  });

  it('surfaces the server refusal instead of pretending success', async () => {
    mockConfirm.mockResolvedValue({ ok: false, error: 'Collected amount must equal the attempt amount' });
    render(<AdminWebPaymentAttemptsScreen />);
    await screen.findByText('Reconciliation required');
    fireEvent.press(screen.getByTestId('confirm-att-timedout-0001'));
    fireEvent.changeText(screen.getByTestId('resolution-note'), 'Portal receipt');
    fireEvent.changeText(screen.getByTestId('resolution-reference'), 'SYNTHETIC00');
    fireEvent.press(screen.getByText('Review confirmation'));
    fireEvent.press(await screen.findByText('Yes, settle this payment'));
    expect(await screen.findByText('Collected amount must equal the attempt amount')).toBeOnTheScreen();
  });
});

describe('no collection — evidence required', () => {
  it('rejects a bare note, accepts note + provider reference, and calls the protected RPC once', async () => {
    render(<AdminWebPaymentAttemptsScreen />);
    await screen.findByText('Reconciliation required');
    fireEvent.press(screen.getByTestId('nocollect-att-timedout-0001'));
    fireEvent.changeText(screen.getByTestId('resolution-note'), 'Customer says nothing was deducted');
    fireEvent.press(screen.getByText('Submit reconciliation'));
    expect(await screen.findByText(/provider reference or confirm the portal check/i)).toBeOnTheScreen();
    expect(mockReconcile).not.toHaveBeenCalled();

    fireEvent.changeText(screen.getByTestId('resolution-reference'), 'SAF-CASE-77');
    fireEvent.press(screen.getByText('Submit reconciliation'));
    await waitFor(() =>
      expect(mockReconcile).toHaveBeenCalledWith('att-timedout-0001', 'Customer says nothing was deducted', 'SAF-CASE-77', 'provider_reference'),
    );
    expect(mockReconcile).toHaveBeenCalledTimes(1);
  });

  it('accepts the explicit portal-verified declaration in place of a reference', async () => {
    render(<AdminWebPaymentAttemptsScreen />);
    await screen.findByText('Reconciliation required');
    fireEvent.press(screen.getByTestId('nocollect-att-timedout-0001'));
    fireEvent.changeText(screen.getByTestId('resolution-note'), 'Portal checked 11 Sep: no transaction for this request');
    fireEvent.press(screen.getByTestId('no-collection-portal-checked'));
    fireEvent.press(screen.getByText('Submit reconciliation'));
    await waitFor(() => expect(mockReconcile).toHaveBeenCalledTimes(1));
    expect(mockReconcile.mock.calls[0][2]).toBeNull();
    expect(mockReconcile.mock.calls[0][3]).toBe('portal_lookup');
  });
});

describe('evidence panel', () => {
  it('separates callback evidence from operator evidence for a settled attempt', async () => {
    render(<AdminWebPaymentAttemptsScreen />);
    await screen.findByText('Reconciliation required');
    fireEvent.press(screen.getByText('Show all'));
    fireEvent.press(await screen.findByTestId('details-att-settled-0003'));
    const panel = within(await screen.findByTestId('attempt-detail'));
    expect(panel.getByText('Callback evidence')).toBeOnTheScreen();
    expect(panel.getByText('Operator evidence')).toBeOnTheScreen();
    expect(panel.getByText(/ResultCode 0/)).toBeOnTheScreen();
    expect(panel.getByText(/Receipt recorded: yes/)).toBeOnTheScreen();
    expect(panel.getByText(/Operator resolution: none/)).toBeOnTheScreen();
  });
});
