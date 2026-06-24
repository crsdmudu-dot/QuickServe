/**
 * daraja.ts — Pure Daraja (M-Pesa) helper functions.
 *
 * PURE TypeScript — no network calls, no Deno-only APIs.
 * Uses only standard globals (`btoa`) available in both Node and Deno.
 *
 * These builders return request *descriptors* (url/method/headers/body).
 * They do NOT call fetch. The Edge Functions consume these helpers.
 */

// ─── Types ────────────────────────────────────────────────────────────────────

/** Which M-Pesa integration environment is active. */
export type MpesaMode = 'mock' | 'sandbox' | 'live';

// ─── Timestamp ────────────────────────────────────────────────────────────────

/**
 * Format a Date as `YYYYMMDDHHmmss` using UTC components.
 *
 * Example: `new Date(Date.UTC(2026,0,2,3,4,5))` → `'20260102030405'`
 */
export function darajaTimestamp(date: Date): string {
  const pad = (n: number, len = 2): string => String(n).padStart(len, '0');

  const yyyy = pad(date.getUTCFullYear(), 4);
  const MM = pad(date.getUTCMonth() + 1);
  const dd = pad(date.getUTCDate());
  const HH = pad(date.getUTCHours());
  const mm = pad(date.getUTCMinutes());
  const ss = pad(date.getUTCSeconds());

  return `${yyyy}${MM}${dd}${HH}${mm}${ss}`;
}

// ─── Password ─────────────────────────────────────────────────────────────────

/**
 * Build the Daraja STK Push password.
 *
 * Formula: `base64(shortcode + passkey + timestamp)`
 */
export function buildStkPassword(
  shortcode: string,
  passkey: string,
  timestamp: string,
): string {
  return btoa(`${shortcode}${passkey}${timestamp}`);
}

// ─── OAuth request descriptor ─────────────────────────────────────────────────

/**
 * Build an OAuth token request descriptor (Basic auth). Does NOT call fetch.
 *
 * URL: `${baseUrl}/oauth/v1/generate?grant_type=client_credentials`
 * Authorization header: `Basic <base64(consumerKey:consumerSecret)>`
 */
export function buildOAuthRequest(
  baseUrl: string,
  consumerKey: string,
  consumerSecret: string,
): { url: string; method: 'GET'; headers: Record<string, string> } {
  return {
    url: `${baseUrl}/oauth/v1/generate?grant_type=client_credentials`,
    method: 'GET',
    headers: {
      Authorization: 'Basic ' + btoa(`${consumerKey}:${consumerSecret}`),
    },
  };
}

// ─── STK Push payload ─────────────────────────────────────────────────────────

/** Parameters for building an STK Push payload. */
export interface StkPushPayloadParams {
  /** Daraja Business Short Code (paybill / till number). */
  shortcode: string;
  /** Pre-built password (see `buildStkPassword`). */
  password: string;
  /** Timestamp in `YYYYMMDDHHmmss` format. */
  timestamp: string;
  /** Amount in KES — will be rounded to the nearest integer. */
  amount: number;
  /** Normalized Kenyan MSISDN (e.g. `254712345678`). */
  phone: string;
  /** HTTPS URL Daraja will POST the result to. */
  callbackUrl: string;
  /** Short reference shown on the M-Pesa prompt (e.g. booking ID). */
  accountReference: string;
  /** Human-readable description of the transaction. */
  transactionDesc: string;
}

/**
 * Build the STK Push request body object ready to JSON-serialize.
 *
 * Amount is rounded to a whole integer (Daraja rejects decimals).
 */
export function buildStkPushPayload(
  p: StkPushPayloadParams,
): Record<string, unknown> {
  return {
    BusinessShortCode: p.shortcode,
    Password: p.password,
    Timestamp: p.timestamp,
    TransactionType: 'CustomerPayBillOnline',
    Amount: Math.round(p.amount),
    PartyA: p.phone,
    PartyB: p.shortcode,
    PhoneNumber: p.phone,
    CallBackURL: p.callbackUrl,
    AccountReference: p.accountReference,
    TransactionDesc: p.transactionDesc,
  };
}

// ─── STK Push request descriptor ─────────────────────────────────────────────

/**
 * Wrap an STK Push payload into a full request descriptor. Does NOT call fetch.
 *
 * URL: `${baseUrl}/mpesa/stkpush/v1/processrequest`
 */
export function buildStkPushRequest(
  baseUrl: string,
  token: string,
  payload: Record<string, unknown>,
): {
  url: string;
  method: 'POST';
  headers: Record<string, string>;
  body: Record<string, unknown>;
} {
  return {
    url: `${baseUrl}/mpesa/stkpush/v1/processrequest`,
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: payload,
  };
}

// ─── Callback parser ──────────────────────────────────────────────────────────

/** Null-safe parsed fields from a Daraja STK callback body. */
export interface ParsedStkCallback {
  merchantRequestId: string | null;
  checkoutRequestId: string | null;
  resultCode: number | null;
  resultDesc: string | null;
}

/**
 * Parse the Daraja STK Push callback body into null-safe fields.
 *
 * Reads `Body.stkCallback.{MerchantRequestID, CheckoutRequestID,
 * ResultCode, ResultDesc}`. Returns all-nulls for any malformed or missing data.
 */
export function parseStkCallback(body: unknown): ParsedStkCallback {
  const nullResult: ParsedStkCallback = {
    merchantRequestId: null,
    checkoutRequestId: null,
    resultCode: null,
    resultDesc: null,
  };

  if (body === null || typeof body !== 'object') {
    return nullResult;
  }

  // Safe property access helpers.
  const obj = body as Record<string, unknown>;
  const bodyProp = obj['Body'];
  if (bodyProp === null || typeof bodyProp !== 'object') {
    return nullResult;
  }

  const bodyObj = bodyProp as Record<string, unknown>;
  const stkCallback = bodyObj['stkCallback'];
  if (stkCallback === null || typeof stkCallback !== 'object') {
    return nullResult;
  }

  const cb = stkCallback as Record<string, unknown>;

  const merchantRequestId =
    typeof cb['MerchantRequestID'] === 'string' ? cb['MerchantRequestID'] : null;
  const checkoutRequestId =
    typeof cb['CheckoutRequestID'] === 'string' ? cb['CheckoutRequestID'] : null;
  const resultCode =
    typeof cb['ResultCode'] === 'number' ? cb['ResultCode'] : null;
  const resultDesc =
    typeof cb['ResultDesc'] === 'string' ? cb['ResultDesc'] : null;

  return { merchantRequestId, checkoutRequestId, resultCode, resultDesc };
}

// ─── Phone helpers ────────────────────────────────────────────────────────────

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
 * Returns `true` when the string is already a valid normalized MSISDN
 * matching `254(7|1)XXXXXXXX` — i.e. exactly 12 digits in international format.
 */
export function isMsisdn(phone: string): boolean {
  return /^254(7|1)\d{8}$/.test(phone);
}

// ─── Mode helpers ─────────────────────────────────────────────────────────────

/**
 * Parse the `MPESA_MODE` environment variable value into a typed `MpesaMode`.
 * Returns `'mock'` when the value is unset, empty, or not a recognised mode.
 */
export function resolveMpesaMode(value: string | undefined): MpesaMode {
  if (value === 'sandbox' || value === 'live') {
    return value;
  }
  return 'mock';
}

/** Returns `true` when the mode is `'mock'`. */
export function isMockMode(mode: MpesaMode): boolean {
  return mode === 'mock';
}

// ─── Mock STK result ──────────────────────────────────────────────────────────

/** Synchronous mock result returned when `MPESA_MODE=mock`. */
export interface MockStkResult {
  merchantRequestId: string;
  checkoutRequestId: string;
  /** Always `'0'` in mock mode. */
  responseCode: '0';
  /** Daraja-shaped mock response object. */
  raw: Record<string, unknown>;
}

/**
 * Generate a synchronous mock STK Push result (no network call).
 *
 * Used by the Edge Function when `MPESA_MODE=mock`.
 * `checkoutRequestId` has the prefix `ws_CO_MOCK-` followed by a random token.
 */
export function mockStkResult(p: {
  phone: string;
  amount: number;
}): MockStkResult {
  const token = Math.random().toString(36).slice(2);
  const merchantRequestId = 'MOCK-MR-' + token;
  const checkoutRequestId = 'ws_CO_MOCK-' + token;

  const raw: Record<string, unknown> = {
    MerchantRequestID: merchantRequestId,
    CheckoutRequestID: checkoutRequestId,
    ResponseCode: '0',
    ResponseDescription: 'Success. Request accepted for processing',
    CustomerMessage: 'Success. Request accepted for processing',
    PhoneNumber: p.phone,
    Amount: p.amount,
  };

  return {
    merchantRequestId,
    checkoutRequestId,
    responseCode: '0',
    raw,
  };
}
