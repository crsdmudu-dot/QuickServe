/**
 * auth-link-request.test.ts — classification of email-link request outcomes (password reset,
 * confirmation resend) into a narrow allow-list of neutral results.
 *
 * Evidence (installed @supabase/auth-js 2.108.2): `AuthApiError { status, code }` for HTTP
 * errors with codes such as `user_not_found`, `over_email_send_rate_limit`,
 * `over_request_rate_limit`, `validation_failed`, `email_address_invalid`,
 * `email_address_not_authorized`, `request_timeout`, `unexpected_failure`;
 * `AuthRetryableFetchError` (status 0 for network failures, 5xx for server errors);
 * `AuthUnknownError` (no status) for non-HTTP failures. Only `user_not_found` and the exact
 * email-send rate limit may read as "sent"; nothing else is neutralised.
 */
import { classifyAuthLinkRequest, type AuthLinkRequestOutcome } from '@/lib/auth-link-request';

const api = (code: string | undefined, status: number, message = 'x'): { name: string; message: string; status: number; code?: string } => ({
  name: 'AuthApiError',
  message,
  status,
  code,
});

describe('classifyAuthLinkRequest', () => {
  it('success is "sent"', () => {
    expect(classifyAuthLinkRequest(null)).toBe<AuthLinkRequestOutcome>('sent');
    expect(classifyAuthLinkRequest(undefined)).toBe('sent');
  });

  it('an explicit account-not-found result is neutralised to "sent" (no enumeration)', () => {
    expect(classifyAuthLinkRequest(api('user_not_found', 400, 'User not found'))).toBe('sent');
  });

  it('the exact email-send rate limit is neutral with a delay hint', () => {
    expect(classifyAuthLinkRequest(api('over_email_send_rate_limit', 429, 'For security purposes, you can only request this after 60 seconds.'))).toBe('sent-rate-limited');
  });

  it('a generic request rate limit is retryable, not neutral', () => {
    expect(classifyAuthLinkRequest(api('over_request_rate_limit', 429))).toBe('retry');
  });

  it('redirect / configuration errors never claim an email was sent', () => {
    expect(classifyAuthLinkRequest(api(undefined, 400, 'redirect_to URL is not allowed'))).toBe('delivery-failed');
    expect(classifyAuthLinkRequest(api('validation_failed', 400, 'redirect_to is not allowed'))).toBe('delivery-failed');
    expect(classifyAuthLinkRequest(api('email_address_not_authorized', 403, 'Email address not authorized'))).toBe('delivery-failed');
  });

  it('validation failures are a safe validation message, not success', () => {
    expect(classifyAuthLinkRequest(api('validation_failed', 400, 'Unable to validate email address: invalid format'))).toBe('invalid-request');
    expect(classifyAuthLinkRequest(api('email_address_invalid', 400, 'Email address is invalid'))).toBe('invalid-request');
  });

  it('network / transport and 5xx failures are retryable', () => {
    expect(classifyAuthLinkRequest({ name: 'AuthRetryableFetchError', message: 'Failed to fetch', status: 0 })).toBe('retry');
    expect(classifyAuthLinkRequest({ name: 'AuthRetryableFetchError', message: 'Service unavailable', status: 503 })).toBe('retry');
    expect(classifyAuthLinkRequest(api('request_timeout', 504))).toBe('retry');
    expect(classifyAuthLinkRequest(api(undefined, 500, 'Internal server error'))).toBe('retry');
    expect(classifyAuthLinkRequest(new TypeError('Network request failed'))).toBe('retry');
  });

  it('unknown 4xx, unexpected Auth failures and unknown errors fail safely (never "sent")', () => {
    expect(classifyAuthLinkRequest(api(undefined, 400, 'Bad request'))).toBe('delivery-failed');
    expect(classifyAuthLinkRequest(api(undefined, 422, 'Unprocessable'))).toBe('delivery-failed');
    expect(classifyAuthLinkRequest(api('unexpected_failure', 500))).toBe('delivery-failed');
    expect(classifyAuthLinkRequest(api('signup_disabled', 422))).toBe('delivery-failed');
    expect(classifyAuthLinkRequest({ name: 'AuthUnknownError', message: 'weird', status: undefined })).toBe('delivery-failed');
    expect(classifyAuthLinkRequest({ message: 'no status, no code' })).toBe('delivery-failed');
    expect(classifyAuthLinkRequest('a string')).toBe('delivery-failed');
  });

  it('never returns anything outside the allow-list', () => {
    const allowed: AuthLinkRequestOutcome[] = ['sent', 'sent-rate-limited', 'invalid-request', 'delivery-failed', 'retry'];
    for (const e of [null, api('user_not_found', 400), api('anything', 418), api(undefined, 499), { status: 0 }, 42]) {
      expect(allowed).toContain(classifyAuthLinkRequest(e));
    }
  });
});
