/**
 * auth-link-request.ts — outcome classification for email-link requests (password reset,
 * confirmation resend) and the centralised, non-sensitive copy for each outcome.
 *
 * Evidence base: installed @supabase/auth-js 2.108.2. HTTP failures arrive as
 * `AuthApiError { status, code }` (codes from `lib/error-codes`); transport failures and 5xx
 * responses as `AuthRetryableFetchError` (status 0 or 5xx); non-HTTP failures as
 * `AuthUnknownError` (no status). `resetPasswordForEmail` / `resend` return Auth errors and
 * rethrow anything else.
 *
 * Only two conditions may read as "sent" (neutral, no account enumeration): an explicit
 * `user_not_found` and the exact email-send rate limit. Everything else fails safely; no status
 * class is neutralised wholesale. The raw error (message, status, code) never leaves this module
 * in a user-visible or logged form.
 */

export type AuthLinkRequestOutcome =
  | 'sent' // success, or an outcome deliberately indistinguishable from success
  | 'sent-rate-limited' // success copy plus a generic delay hint (exact email-send rate limit)
  | 'invalid-request' // the address failed server-side validation
  | 'delivery-failed' // configuration / unexpected failure: do not claim an email was sent
  | 'retry'; // transport / server failure: safe to retry

const NEUTRAL_CODES = new Set(['user_not_found']);
const RETRYABLE_CODES = new Set(['request_timeout', 'over_request_rate_limit']);
const VALIDATION_CODES = new Set(['validation_failed', 'email_address_invalid']);

type ErrorShape = { name?: unknown; message?: unknown; status?: unknown; code?: unknown };

export function classifyAuthLinkRequest(error: unknown): AuthLinkRequestOutcome {
  if (error === null || error === undefined) return 'sent';
  if (typeof error !== 'object') return 'delivery-failed';
  const e = error as ErrorShape;
  const code = typeof e.code === 'string' ? e.code : undefined;
  const status = typeof e.status === 'number' ? e.status : undefined;
  const name = typeof e.name === 'string' ? e.name : '';
  const message = typeof e.message === 'string' ? e.message.toLowerCase() : '';

  if (code && NEUTRAL_CODES.has(code)) return 'sent';
  if (code === 'over_email_send_rate_limit') return 'sent-rate-limited';
  if (name === 'AuthRetryableFetchError') return 'retry';
  if (code && RETRYABLE_CODES.has(code)) return 'retry';
  if (name === 'TypeError' || /network|failed to fetch|timeout/.test(message)) return 'retry';
  // Redirect-URL / configuration problems can surface under `validation_failed`: never "sent".
  if (/redirect/.test(message)) return 'delivery-failed';
  if (code && VALIDATION_CODES.has(code)) return 'invalid-request';
  if (code === 'unexpected_failure') return 'delivery-failed';
  if (status !== undefined && status >= 500 && !code) return 'retry';
  return 'delivery-failed';
}

/** Centralised user-facing copy. None of these strings reveal account existence or internals. */
export const AUTH_LINK_REQUEST_COPY = {
  resetSent: "If an account exists for that email, we've sent a password reset link.",
  confirmationSent: "If an account exists for that email, we've sent a new confirmation link.",
  rateLimitHint: "If it doesn't arrive, wait a minute before trying again.",
  invalidRequest: 'Please check the email address and try again.',
  deliveryFailed: "We couldn't send the email. Please try again later or contact support.",
  retry: "We couldn't send the email right now. Please try again.",
} as const;

/** True when the outcome should be presented as a (neutral) success. */
export function isNeutralSuccess(outcome: AuthLinkRequestOutcome): boolean {
  return outcome === 'sent' || outcome === 'sent-rate-limited';
}

/** Failure copy for a non-success outcome; unknown values fall back to the safest message. */
export function authLinkFailureCopy(outcome: string): string {
  switch (outcome) {
    case 'invalid-request':
      return AUTH_LINK_REQUEST_COPY.invalidRequest;
    case 'retry':
      return AUTH_LINK_REQUEST_COPY.retry;
    default:
      return AUTH_LINK_REQUEST_COPY.deliveryFailed;
  }
}
