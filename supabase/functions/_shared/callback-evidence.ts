/**
 * callback-evidence.ts — Deno-free helpers for the mpesa-callback Edge Function (0054).
 *
 * Kept free of Deno globals so the app test suite can load it directly.
 *
 * Classification of an AUTHENTICATED callback (the token check has already passed):
 *   'apply'                            body carries a CheckoutRequestID → the database decides
 *                                      known (certified 0050 path) vs unknown (durable evidence)
 *   'missing_checkout_request_id'      a Daraja-shaped body with no CheckoutRequestID
 *   'malformed_authenticated_callback' null / non-object / not Daraja-shaped at all
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

export function classifyAuthenticatedCallback(
  body: unknown,
  parsed: { checkoutRequestId: string | null },
): CallbackClassification {
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
