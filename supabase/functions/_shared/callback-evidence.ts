/**
 * callback-evidence.ts — Deno-free helpers for the mpesa-callback Edge Function (0054).
 *
 * Kept free of Deno globals so the app test suite can load it directly.
 *
 * Classification of an AUTHENTICATED callback (the token check has already passed):
 *   'apply'                            body carries a CheckoutRequestID → the database decides
 *                                      known (certified 0050 path) vs unknown (durable evidence)
 *   'missing_checkout_request_id'      a Daraja-shaped body with no CheckoutRequestID
 *   'malformed_authenticated_callback' null / non-object / not Daraja-shaped at all, OR (update 50,
 *                                      S43-2) a stkCallback whose ResultCode is present but is not
 *                                      a plain whole number — see `hasInvalidResultCode`
 *
 * Nothing here settles anything; it only decides which service-role RPC receives the callback.
 */

export type CallbackClassification =
  | 'apply'
  | 'missing_checkout_request_id'
  | 'malformed_authenticated_callback';

function isRecord(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

/** Daraja-shaped = { Body: { stkCallback: {...} } }. */
export function isDarajaShaped(body: unknown): boolean {
  if (!isRecord(body)) return false;
  const b = body['Body'];
  if (!isRecord(b)) return false;
  return isRecord(b['stkCallback']);
}

/** A plain JSON integer literal: an optional minus sign and digits, no decimal point, no exponent. */
const PLAIN_INTEGER_LITERAL = /^-?(0|[1-9]\d*)$/;

/**
 * The JSON text written after every `"ResultCode":` key in the raw body, for example ['0'] or
 * ['0.4']. Strings keep their quotes, so `"0"` stays distinguishable from `0`.
 */
export function resultCodeLiterals(rawText: string): string[] {
  return [...rawText.matchAll(/"ResultCode"\s*:\s*("(?:[^"\\]|\\.)*"|[^,}\]\s]+)/g)].map((m) => m[1]);
}

/**
 * S43-2: is the stkCallback's ResultCode present but NOT a plain whole number?
 *
 * Daraja sends ResultCode as a JSON integer (0, 1032, …). Anything else — 0.4, 1.5, the strings
 * "0" or "0.0", true, null, an object — and, when the raw text is given, an integer VALUE written
 * in another form (1e0, 0.0, 1.0) is not a result Daraja would send. Such a callback is treated as
 * malformed evidence: it is never a candidate to apply and its ResultCode never reaches the
 * database. A ResultCode that is ABSENT is left alone (unchanged 0054 behaviour).
 */
export function hasInvalidResultCode(body: unknown, rawText?: string): boolean {
  if (!isDarajaShaped(body)) return false;
  const cb = (body as { Body: { stkCallback: Record<string, unknown> } }).Body.stkCallback;
  if (!('ResultCode' in cb)) return false;

  const value = cb['ResultCode'];
  if (typeof value !== 'number' || !Number.isInteger(value)) return true;

  // The value is a whole number; it must also be WRITTEN as one (1e0 and 0.0 are refused).
  if (rawText !== undefined && resultCodeLiterals(rawText).some((l) => !PLAIN_INTEGER_LITERAL.test(l))) {
    return true;
  }
  return false;
}

export function classifyAuthenticatedCallback(
  body: unknown,
  parsed: { checkoutRequestId: string | null },
  rawText?: string,
): CallbackClassification {
  // S43-2 first: a non-integer ResultCode is malformed even when a CheckoutRequestID is present.
  if (hasInvalidResultCode(body, rawText)) return 'malformed_authenticated_callback';
  if (parsed.checkoutRequestId) return 'apply';
  if (isDarajaShaped(body)) return 'missing_checkout_request_id';
  return 'malformed_authenticated_callback';
}

/** '***' + last three digits, or null when the value has fewer than three digits. */
export function maskMsisdn(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const digits = String(v).replace(/\D/g, '');
  if (digits.length < 3) return null;
  return '***' + digits.slice(-3);
}

/**
 * Parse the raw request text as JSON. `ok: false` means the bytes are NOT JSON at all — a
 * different situation from valid JSON that lacks M-PESA fields (which parses, then classifies as
 * missing/malformed). Never throws.
 */
export function parseJsonBody(text: string): { ok: true; body: unknown } | { ok: false } {
  try {
    return { ok: true, body: JSON.parse(text) };
  } catch {
    return { ok: false };
  }
}

/** Lowercase SHA-256 hex of raw bytes (Web Crypto; available in Deno and modern Node). */
export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes as BufferSource);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}
