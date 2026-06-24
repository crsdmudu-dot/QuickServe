/**
 * mpesa.ts — Mock M-Pesa STK Push service + Kenyan phone helpers.
 *
 * MOCK ONLY. No network calls, no secrets, no environment variables.
 * This file is the integration seam where a real Daraja STK Push call drops in later.
 *
 * REAL DARAJA SEAM (do NOT implement here — see note below):
 * ─────────────────────────────────────────────────────────────
 * Real integration will:
 *  1. Fetch credentials (consumer key, secret, passkey, shortcode) from env /
 *     Supabase secrets — NEVER commit them to the repo.
 *  2. Exchange credentials for an OAuth access token via
 *     POST https://sandbox.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials
 *  3. POST to the Daraja STK Push endpoint:
 *     https://sandbox.safaricom.co.ke/mpesa/stkpush/v1/processrequest
 *     with the signed payload (Timestamp, Password = base64(Shortcode+Passkey+Timestamp)).
 *  4. Return the real CheckoutRequestID from the response as `externalReference`.
 * ─────────────────────────────────────────────────────────────
 */

/** Parameters required to initiate an STK Push. */
export type StkPushParams = {
  /** Normalized Kenyan phone number (e.g. 254712345678). */
  phone: string;
  /** Amount in Kenyan Shillings (whole number). */
  amount: number;
  /** Short reference shown on the M-Pesa prompt (e.g. booking ID). */
  accountReference: string;
};

/** Result returned by `initiateStkPushMock`. */
export type StkPushResult = {
  /** True when the STK Push was accepted for processing. */
  ok: boolean;
  /** Mock CheckoutRequestID (real Daraja will return a UUID-like string). */
  externalReference: string;
  /** Daraja-shaped mock response object. */
  raw: Record<string, unknown>;
  /** Human-readable error message, present only when ok === false. */
  error?: string;
};

/**
 * Normalize a Kenyan Safaricom MSISDN to the 12-digit international format
 * `254(7|1)XXXXXXXX`.
 *
 * Accepted inputs (spaces and a leading '+' are stripped first):
 * - `07XXXXXXXX` / `01XXXXXXXX` — 10-digit local format
 * - `2547XXXXXXXX` / `2541XXXXXXXX` — already in international format
 *
 * @returns The normalized 12-digit string, or `null` if the input is invalid.
 */
export function normalizeKenyanPhone(input: string): string | null {
  // Strip all whitespace and a leading '+'.
  const cleaned = input.replace(/\s+/g, '').replace(/^\+/, '');

  // Local format: 07XXXXXXXX or 01XXXXXXXX (10 digits).
  if (/^0(7|1)\d{8}$/.test(cleaned)) {
    return '254' + cleaned.slice(1);
  }

  // International format: 2547XXXXXXXX or 2541XXXXXXXX (12 digits).
  if (/^254(7|1)\d{8}$/.test(cleaned)) {
    return cleaned;
  }

  return null;
}

/**
 * Returns `true` when `normalizeKenyanPhone(input)` produces a valid result.
 *
 * @param input - Raw phone number string.
 */
export function isValidKenyanPhone(input: string): boolean {
  return normalizeKenyanPhone(input) !== null;
}

/**
 * MOCK ONLY — pure + synchronous. Simulates a successful M-Pesa STK Push
 * acknowledgement without hitting any network endpoint.
 *
 * The returned `raw` object mirrors the shape of a real Daraja STK Push
 * success response so that downstream code can be written against the real
 * shape today and swapped to the live call later with minimal changes.
 *
 * @param params - STK Push parameters (phone, amount, accountReference).
 * @returns A `StkPushResult` with `ok === true` and a fake CheckoutRequestID.
 */
export function initiateStkPushMock(params: StkPushParams): StkPushResult {
  // Generate a short random token — no external dependencies needed.
  const token = Math.random().toString(36).slice(2);
  const externalReference = 'MOCK-' + token;

  // Daraja-shaped mock response (mirrors the real STK Push response body).
  const raw: Record<string, unknown> = {
    MerchantRequestID: 'MOCK-MR-' + token,
    CheckoutRequestID: externalReference,
    ResponseCode: '0',
    ResponseDescription: 'Success. Request accepted for processing',
    CustomerMessage: 'Success. Request accepted for processing',
  };

  return { ok: true, externalReference, raw };
}
