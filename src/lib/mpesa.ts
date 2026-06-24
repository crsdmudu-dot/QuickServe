/**
 * mpesa.ts — Kenyan phone helpers for M-Pesa.
 *
 * The STK Push mock has been removed — it now lives server-side in the
 * `mpesa-stk-push` Edge Function. This file only exports the phone
 * validation/normalization helpers used by the client.
 */

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

