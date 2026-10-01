/**
 * mpesa-payment-status.ts — what the customer is told about an M-PESA payment (P7).
 *
 * Pure helpers, no network. The booking detail screen uses them to:
 *   - turn the `mpesa-stk-push` error `code` into a clear sentence (instead of one generic text);
 *   - explain the newest payment attempt (waiting for the PIN, confirming, failed);
 *   - decide when the Pay button must be hidden (while an attempt still blocks the payment);
 *   - time the automatic refresh after a payment request.
 *
 * The error codes mirror the list in supabase/functions/mpesa-stk-push/index.ts. A test checks
 * that every code the function can send has a text here.
 */

import type { AttemptStatus, PaymentAttempt } from '@/lib/attempts';

/**
 * The business name the customer sees on the M-PESA prompt: the name registered for the
 * shortcode (not "KwikServe"). Recorded 2026-09-27 from the owner's practical payment test: the
 * registered Paybill was shown to the payer as "Hired Corp Ltd". The live check E1 re-observes it.
 */
export const MPESA_PROMPT_BUSINESS_NAME = 'Hired Corp Ltd';

/** After a payment request, refresh this often… */
export const PAYMENT_REFRESH_INTERVAL_MS = 5000;

/** …for at most this long (3 minutes), then stop. */
export const PAYMENT_REFRESH_WINDOW_MS = 3 * 60 * 1000;

/** Shown when payments are switched off (`MPESA_MODE=disabled`) or cannot run right now. */
export const PAYMENTS_UNAVAILABLE_TEXT =
  'M-PESA payments are temporarily unavailable. Your booking is safe. Please do not pay by any other method; we will notify you when you can pay.';

/** The fallback text for any error we cannot explain better. */
export const GENERIC_PAY_ERROR_TEXT = 'Could not start payment. Please try again.';

/** Every stable error code `mpesa-stk-push` can send, with the text the customer sees. */
export const MPESA_ERROR_TEXTS = {
  payments_unavailable: PAYMENTS_UNAVAILABLE_TEXT,
  invalid_request: 'Enter a valid M-Pesa phone number and try again.',
  not_payable: 'This payment is not due right now. Please reopen the booking to see its latest status.',
  job_not_completed: 'You can pay once the job is marked completed.',
  amount_not_payable:
    'This amount cannot be paid with M-PESA. Please contact support so we can correct it. Do not pay by any other method.',
  payment_in_progress:
    'A payment request is already in progress. Check your phone, or wait for it to be confirmed before trying again.',
  could_not_start: GENERIC_PAY_ERROR_TEXT,
  request_rejected: 'M-PESA did not accept the payment request. Check the phone number and try again.',
  status_unknown:
    'We could not confirm that the payment request reached M-PESA. Do not pay again; check your phone and we will update this booking.',
  not_recorded:
    'Your payment request was sent but we could not save it. Do not pay again; we will update this booking.',
  unexpected_error: GENERIC_PAY_ERROR_TEXT,
} as const;

export type MpesaErrorCode = keyof typeof MPESA_ERROR_TEXTS;

/** True when the value is one of the known error codes. */
export function isMpesaErrorCode(value: unknown): value is MpesaErrorCode {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(MPESA_ERROR_TEXTS, value);
}

/** The customer text for an error code; the generic text for anything unknown or missing. */
export function mpesaErrorText(code: unknown): string {
  return isMpesaErrorCode(code) ? MPESA_ERROR_TEXTS[code] : GENERIC_PAY_ERROR_TEXT;
}

/**
 * Codes after which an attempt may exist (or already existed), so the screen should reload the
 * attempts and keep refreshing: the request may still settle.
 */
export function mayHaveOpenAttempt(code: MpesaErrorCode | undefined): boolean {
  return code === 'status_unknown' || code === 'not_recorded' || code === 'payment_in_progress';
}

/**
 * An attempt that still BLOCKS the payment: the database refuses a new request, a wallet credit
 * or a promo while it exists (migration 0045). The Pay button is hidden for these.
 */
export function isBlockingAttempt(status: AttemptStatus | undefined): boolean {
  return status === 'initiated' || status === 'pending' || status === 'timed_out';
}

/** An attempt still waiting for the customer's PIN or for Safaricom's answer. */
export function isAwaitingMpesa(status: AttemptStatus | undefined): boolean {
  return status === 'initiated' || status === 'pending';
}

/** A short, friendly reason for a failed attempt, from Safaricom's ResultCode when we know it. */
export function failureReason(attempt: Pick<PaymentAttempt, 'result_code' | 'result_desc'>): string {
  switch (attempt.result_code) {
    case 1032:
      return 'The M-PESA request was cancelled.';
    case 1037:
    case 1038:
    case 1019:
      return 'The M-PESA request was not answered in time.';
    case 1:
      return 'The M-PESA balance was not enough.';
    case 2001:
      return 'The M-PESA PIN was not accepted.';
    default: {
      const desc = (attempt.result_desc ?? '').trim();
      if (desc === '') return 'M-PESA did not complete the payment.';
      return /[.!?]$/.test(desc) ? desc : `${desc}.`;
    }
  }
}

/**
 * The sentence shown under the newest attempt's badge, or null when there is nothing to add.
 *
 * - initiated / pending: tell the customer to look at their phone, and whose name the prompt shows;
 * - timed_out: we are still confirming — do NOT pay again;
 * - failed: the reason, and that a new try is allowed.
 */
export function attemptStatusText(
  attempt: Pick<PaymentAttempt, 'status' | 'result_code' | 'result_desc'>,
): string | null {
  switch (attempt.status) {
    case 'initiated':
    case 'pending':
      return `Check your phone and enter your M-PESA PIN. The prompt will show ${MPESA_PROMPT_BUSINESS_NAME}.`;
    case 'timed_out':
      return 'We are confirming this payment with M-PESA. Do not pay again; we will update you.';
    case 'failed':
      return `${failureReason(attempt)} You can try again.`;
    default:
      return null;
  }
}
