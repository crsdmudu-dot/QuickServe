/**
 * Tests for mpesa-payment-status.ts — the customer texts and rules for M-PESA payments (P7).
 */
import {
  GENERIC_PAY_ERROR_TEXT,
  MPESA_ERROR_TEXTS,
  MPESA_PROMPT_BUSINESS_NAME,
  PAYMENTS_UNAVAILABLE_TEXT,
  PAYMENT_REFRESH_INTERVAL_MS,
  PAYMENT_REFRESH_WINDOW_MS,
  attemptStatusText,
  failureReason,
  isAwaitingMpesa,
  isBlockingAttempt,
  isMpesaErrorCode,
  mayHaveOpenAttempt,
  mpesaErrorText,
} from '@/lib/mpesa-payment-status';
import type { AttemptStatus } from '@/lib/attempts';

const ALL_STATUSES: AttemptStatus[] = ['initiated', 'pending', 'successful', 'failed', 'cancelled', 'timed_out'];

describe('refresh timing', () => {
  it('refreshes about every 5 seconds for about 3 minutes', () => {
    expect(PAYMENT_REFRESH_INTERVAL_MS).toBe(5000);
    expect(PAYMENT_REFRESH_WINDOW_MS).toBe(180000);
  });
});

describe('mpesaErrorText', () => {
  it('uses the plan text when payments are unavailable (disabled)', () => {
    expect(mpesaErrorText('payments_unavailable')).toBe(PAYMENTS_UNAVAILABLE_TEXT);
    expect(PAYMENTS_UNAVAILABLE_TEXT).toBe(
      'M-PESA payments are temporarily unavailable. Your booking is safe. Please do not pay by any other method; we will notify you when you can pay.',
    );
  });

  it('tells the customer NOT to pay again when the outcome is unknown', () => {
    expect(mpesaErrorText('status_unknown')).toMatch(/Do not pay again/);
    expect(mpesaErrorText('not_recorded')).toMatch(/Do not pay again/);
  });

  it('has a non-empty text for every code', () => {
    for (const [code, text] of Object.entries(MPESA_ERROR_TEXTS)) {
      expect(text.length).toBeGreaterThan(10);
      expect(mpesaErrorText(code)).toBe(text);
    }
  });

  it.each([undefined, null, 42, '', 'something_new', 'toString', '__proto__'])(
    'falls back to the generic text for %p',
    (code) => {
      expect(mpesaErrorText(code)).toBe(GENERIC_PAY_ERROR_TEXT);
      expect(isMpesaErrorCode(code)).toBe(false);
    },
  );
});

describe('mayHaveOpenAttempt', () => {
  it('is true only for the codes after which an attempt may exist', () => {
    const open = Object.keys(MPESA_ERROR_TEXTS).filter((c) => mayHaveOpenAttempt(c as never));
    expect(open.sort()).toEqual(['not_recorded', 'payment_in_progress', 'status_unknown']);
    expect(mayHaveOpenAttempt(undefined)).toBe(false);
  });
});

describe('isBlockingAttempt / isAwaitingMpesa', () => {
  it('blocks the Pay button for initiated, pending and timed_out only', () => {
    expect(ALL_STATUSES.filter((s) => isBlockingAttempt(s))).toEqual(['initiated', 'pending', 'timed_out']);
    expect(isBlockingAttempt(undefined)).toBe(false);
  });

  it('keeps refreshing only while waiting for M-PESA (initiated, pending)', () => {
    expect(ALL_STATUSES.filter((s) => isAwaitingMpesa(s))).toEqual(['initiated', 'pending']);
    expect(isAwaitingMpesa(undefined)).toBe(false);
  });
});

describe('attemptStatusText', () => {
  const attempt = (status: AttemptStatus, result_code: number | null = null, result_desc: string | null = null) => ({
    status,
    result_code,
    result_desc,
  });

  it('pending / initiated: check your phone, and whose name the prompt shows', () => {
    const text = `Check your phone and enter your M-PESA PIN. The prompt will show ${MPESA_PROMPT_BUSINESS_NAME}.`;
    expect(attemptStatusText(attempt('pending'))).toBe(text);
    expect(attemptStatusText(attempt('initiated'))).toBe(text);
  });

  it('timed out: we are confirming, do not pay again', () => {
    expect(attemptStatusText(attempt('timed_out'))).toBe(
      'We are confirming this payment with M-PESA. Do not pay again; we will update you.',
    );
  });

  it('failed: the reason and "You can try again"', () => {
    expect(attemptStatusText(attempt('failed', 1032))).toBe('The M-PESA request was cancelled. You can try again.');
  });

  it('successful and cancelled: nothing to add', () => {
    expect(attemptStatusText(attempt('successful'))).toBeNull();
    expect(attemptStatusText(attempt('cancelled'))).toBeNull();
  });
});

describe('failureReason', () => {
  it.each([
    [1032, 'The M-PESA request was cancelled.'],
    [1037, 'The M-PESA request was not answered in time.'],
    [1038, 'The M-PESA request was not answered in time.'],
    [1019, 'The M-PESA request was not answered in time.'],
    [1, 'The M-PESA balance was not enough.'],
    [2001, 'The M-PESA PIN was not accepted.'],
  ])('ResultCode %p → %p', (code, text) => {
    expect(failureReason({ result_code: code, result_desc: 'raw text' })).toBe(text);
  });

  it('otherwise shows Safaricom’s description, ending with a full stop', () => {
    expect(failureReason({ result_code: 9999, result_desc: 'Error while sending push' })).toBe('Error while sending push.');
    expect(failureReason({ result_code: null, result_desc: 'Rejected.' })).toBe('Rejected.');
  });

  it('has a generic reason when there is no description', () => {
    expect(failureReason({ result_code: null, result_desc: null })).toBe('M-PESA did not complete the payment.');
    expect(failureReason({ result_code: 17, result_desc: '   ' })).toBe('M-PESA did not complete the payment.');
  });
});
