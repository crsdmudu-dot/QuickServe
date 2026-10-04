/**
 * daraja.ts — Pure Daraja (M-Pesa) helper functions.
 *
 * PURE TypeScript — no network calls, no Deno-only APIs.
 * Uses only standard globals (`btoa`, `URL`) available in both Node and Deno.
 *
 * These builders return request *descriptors* (url/method/headers/body).
 * They do NOT call fetch. The Edge Functions consume these helpers.
 *
 * Live-payment hardening (update 50) added, all still pure:
 *   - the fail-closed mode switch: unknown or unset `MPESA_MODE` is `disabled`, never `mock`,
 *     and `mock` is refused on the Production project (P1, S40-10);
 *   - the settings check that `sandbox` and `live` must pass before any request (P1, P6);
 *   - the payable-amount guard: whole shillings from 1 to 250,000, never rounded (P3);
 *   - the STK description `KwikServe` (P2);
 *   - the OAuth answer reader that refuses a failed or empty answer (P5);
 *   - the STK Push Query builder, its answer reader and the bounded confirmation loop used by
 *     mpesa-callback before it applies a success (P4a, S40-2).
 */

// ─── Types ────────────────────────────────────────────────────────────────────

/**
 * Which M-Pesa integration environment is active.
 *
 * - `disabled`: payments are switched off; the STK function refuses before creating anything.
 * - `mock`: synthetic answers, no Safaricom call. For development and QA only, never Production.
 * - `sandbox`: Safaricom's test environment.
 * - `live`: Safaricom's production environment. Real money moves.
 */
export type MpesaMode = 'disabled' | 'mock' | 'sandbox' | 'live';

/** The two M-PESA Express transaction types: Paybill and Till (Buy Goods). */
export type StkTransactionType = 'CustomerPayBillOnline' | 'CustomerBuyGoodsOnline';

// ─── Constants ────────────────────────────────────────────────────────────────

/** The Production Supabase project ref. `mock` is never allowed on this project (S40-10). */
export const PRODUCTION_PROJECT_REF = 'lkigkltvstlxfdztffds';

/** Safaricom's production Daraja host. `live` must use it; `sandbox` must not. */
export const DARAJA_PRODUCTION_HOST = 'api.safaricom.co.ke';

/** Text shown on the customer's M-PESA prompt and statement for our payments (P2, G22). */
export const STK_TRANSACTION_DESC = 'KwikServe';

/** Daraja's documented maximum length for `TransactionDesc`. */
export const STK_TRANSACTION_DESC_MAX_LENGTH = 13;

/** Daraja's documented maximum length for `AccountReference`. */
export const STK_ACCOUNT_REFERENCE_MAX_LENGTH = 12;

/** Smallest amount M-PESA Express accepts, in whole shillings. */
export const MPESA_MIN_AMOUNT_KES = 1;

/** Largest single M-PESA transaction, in whole shillings (Safaricom's per-transaction limit). */
export const MPESA_MAX_AMOUNT_KES = 250000;

/** The settings `sandbox` and `live` cannot run without. Names only; values are never logged. */
export const REQUIRED_DARAJA_SETTINGS = [
  'DARAJA_BASE_URL',
  'DARAJA_CONSUMER_KEY',
  'DARAJA_CONSUMER_SECRET',
  'DARAJA_SHORTCODE',
  'DARAJA_PASSKEY',
  'DARAJA_CALLBACK_URL',
] as const;

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

// ─── Base URL ─────────────────────────────────────────────────────────────────

/**
 * Tidy the `DARAJA_BASE_URL` setting: surrounding spaces and trailing slashes are removed, so
 * `https://api.safaricom.co.ke/` and `https://api.safaricom.co.ke` build the same request URLs.
 */
export function darajaBaseUrl(value: string | undefined): string {
  return (value ?? '').trim().replace(/\/+$/, '');
}

/** True only for `https://api.safaricom.co.ke` (Safaricom's production host) with no path. */
export function isDarajaProductionUrl(value: string | undefined): boolean {
  let url: URL;
  try {
    url = new URL(darajaBaseUrl(value));
  } catch {
    return false;
  }
  return (
    url.protocol === 'https:' &&
    url.hostname === DARAJA_PRODUCTION_HOST &&
    url.port === '' &&
    url.username === '' &&
    url.password === '' &&
    url.pathname === '/' &&
    url.search === '' &&
    url.hash === ''
  );
}

/** True when the value points at Safaricom's production host at all (any scheme or path). */
function mentionsDarajaProductionHost(value: string): boolean {
  try {
    return new URL(value).hostname === DARAJA_PRODUCTION_HOST;
  } catch {
    return value.toLowerCase().includes(DARAJA_PRODUCTION_HOST);
  }
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

/** An HTTP answer from Daraja: the ok flag, the status and the parsed JSON body (or null). */
export type DarajaHttpResult = {
  ok: boolean;
  status: number;
  body: Record<string, unknown> | null;
};

/** What the OAuth reader decided. `problem` never contains a credential. */
export type OAuthAnswer =
  | { ok: true; token: string; expiresInSeconds: number }
  | { ok: false; problem: string };

/**
 * Read Daraja's OAuth answer (P5). Refuses a non-2xx answer, an unparseable body and a body with
 * no `access_token`, so a credential failure can never be cached or used as a token.
 *
 * `expires_in` arrives as a string (for example `"3599"`); anything unusable falls back to one hour.
 */
export function readOAuthAnswer(r: DarajaHttpResult): OAuthAnswer {
  if (!r.ok) {
    return { ok: false, problem: `OAuth refused (HTTP ${r.status})` };
  }
  if (!r.body) {
    return { ok: false, problem: 'OAuth answer was not JSON' };
  }
  const token = r.body['access_token'];
  if (typeof token !== 'string' || token.trim() === '') {
    return { ok: false, problem: 'OAuth answer had no access token' };
  }
  const seconds = Number(r.body['expires_in']);
  const expiresInSeconds = Number.isFinite(seconds) && seconds > 120 ? seconds : 3600;
  return { ok: true, token, expiresInSeconds };
}

// ─── Mode helpers ─────────────────────────────────────────────────────────────

/**
 * Parse the `MPESA_MODE` setting into a typed `MpesaMode`.
 *
 * Only the exact words `mock`, `sandbox`, `live` and `disabled` are recognised. Unset, empty or
 * any other value (a typo, extra spaces, capitals) is `disabled`: payments FAIL CLOSED. Before
 * update 50 an unknown value silently became `mock`.
 */
export function resolveMpesaMode(value: string | undefined): MpesaMode {
  if (value === 'mock' || value === 'sandbox' || value === 'live') {
    return value;
  }
  return 'disabled';
}

/** Returns `true` when the mode is `'mock'`. */
export function isMockMode(mode: MpesaMode): boolean {
  return mode === 'mock';
}

/** True when `SUPABASE_URL` belongs to the Production project (matched by its project ref). */
export function isProductionProject(supabaseUrl: string | undefined): boolean {
  return (supabaseUrl ?? '').toLowerCase().includes(PRODUCTION_PROJECT_REF);
}

/**
 * The mode the STK function must actually use (S40-10).
 *
 * `mock` is refused IN CODE on Production: there it behaves as `disabled`. It is also refused
 * when `SUPABASE_URL` is missing, because then we cannot prove the project is not Production.
 * Every other mode is returned unchanged.
 */
export function effectiveMpesaMode(
  modeSetting: string | undefined,
  supabaseUrl: string | undefined,
): MpesaMode {
  const mode = resolveMpesaMode(modeSetting);
  if (mode === 'mock' && (!supabaseUrl || isProductionProject(supabaseUrl))) {
    return 'disabled';
  }
  return mode;
}

// ─── Settings check (sandbox / live) ──────────────────────────────────────────

/** Every Daraja setting the STK function needs, already checked. */
export interface DarajaSettings {
  baseUrl: string;
  consumerKey: string;
  consumerSecret: string;
  shortcode: string;
  passkey: string;
  callbackUrl: string;
  /** From `DARAJA_TRANSACTION_TYPE`; `CustomerPayBillOnline` when unset (P6). */
  transactionType: StkTransactionType;
  /** From `DARAJA_PARTY_B`; the shortcode when unset, exactly as before (P6). */
  partyB: string;
}

/** The outcome of `checkDarajaSettings`. `problem` names settings only, never their values. */
export type DarajaSettingsCheck =
  | { ok: true; settings: DarajaSettings }
  | { ok: false; problem: string };

/**
 * Check the Daraja settings before `sandbox` or `live` may run (P1, P6).
 *
 * - Every setting in `REQUIRED_DARAJA_SETTINGS` must be non-blank.
 * - `live` must use Safaricom's production host, exactly `https://api.safaricom.co.ke`.
 * - `sandbox` must NOT use the production host.
 * - `DARAJA_TRANSACTION_TYPE` (optional) is `CustomerPayBillOnline` (the default) or
 *   `CustomerBuyGoodsOnline` (a Till). Any other value is refused.
 * - `DARAJA_PARTY_B` (optional) defaults to `DARAJA_SHORTCODE`, so a Paybill is unchanged.
 *
 * @param getSetting reads one setting by name (the Edge function passes `Deno.env.get`).
 */
export function checkDarajaSettings(
  mode: 'sandbox' | 'live',
  getSetting: (name: string) => string | undefined,
): DarajaSettingsCheck {
  const missing = REQUIRED_DARAJA_SETTINGS.filter((name) => (getSetting(name) ?? '').trim() === '');
  if (missing.length > 0) {
    return { ok: false, problem: `missing setting ${missing.join(', ')}` };
  }

  const baseUrl = darajaBaseUrl(getSetting('DARAJA_BASE_URL'));
  if (mode === 'live' && !isDarajaProductionUrl(baseUrl)) {
    return { ok: false, problem: 'live mode needs DARAJA_BASE_URL to be the production host' };
  }
  if (mode === 'sandbox' && mentionsDarajaProductionHost(baseUrl)) {
    return { ok: false, problem: 'sandbox mode refuses the production host in DARAJA_BASE_URL' };
  }

  const typeSetting = (getSetting('DARAJA_TRANSACTION_TYPE') ?? '').trim();
  let transactionType: StkTransactionType;
  if (typeSetting === '' || typeSetting === 'CustomerPayBillOnline') {
    transactionType = 'CustomerPayBillOnline';
  } else if (typeSetting === 'CustomerBuyGoodsOnline') {
    transactionType = 'CustomerBuyGoodsOnline';
  } else {
    return { ok: false, problem: 'DARAJA_TRANSACTION_TYPE is not a known transaction type' };
  }

  const shortcode = getSetting('DARAJA_SHORTCODE') as string;
  const partyBSetting = (getSetting('DARAJA_PARTY_B') ?? '').trim();

  return {
    ok: true,
    settings: {
      baseUrl,
      consumerKey: getSetting('DARAJA_CONSUMER_KEY') as string,
      consumerSecret: getSetting('DARAJA_CONSUMER_SECRET') as string,
      shortcode,
      passkey: getSetting('DARAJA_PASSKEY') as string,
      callbackUrl: getSetting('DARAJA_CALLBACK_URL') as string,
      transactionType,
      partyB: partyBSetting === '' ? shortcode : partyBSetting,
    },
  };
}

// ─── Amount guard (P3) ────────────────────────────────────────────────────────

/** The outcome of `checkMpesaAmount`. `message` is safe to show and to store. */
export type MpesaAmountCheck =
  | { ok: true }
  | { ok: false; reason: 'not_whole' | 'below_minimum' | 'above_limit'; message: string };

/**
 * Can this amount be sent to M-PESA exactly as it is?
 *
 * M-PESA only takes whole shillings, and the database settles only on an EXACT match. So a
 * fractional amount is refused here instead of being rounded: rounding charged the customer an
 * amount that could then never settle.
 */
export function checkMpesaAmount(amount: number): MpesaAmountCheck {
  if (!Number.isInteger(amount)) {
    return {
      ok: false,
      reason: 'not_whole',
      message: 'The amount due is not a whole number of shillings.',
    };
  }
  if (amount < MPESA_MIN_AMOUNT_KES) {
    return { ok: false, reason: 'below_minimum', message: 'The amount due is below KES 1.' };
  }
  if (amount > MPESA_MAX_AMOUNT_KES) {
    return {
      ok: false,
      reason: 'above_limit',
      message: 'The amount due is above the M-PESA limit of KES 250,000 per transaction.',
    };
  }
  return { ok: true };
}

/**
 * The amount still to collect for a payment row: amount − wallet credit − promo discount.
 *
 * Used ONLY for the early refusal check before the reservation. The amount actually sent to
 * Daraja is always the one `reserve_mpesa_attempt` returns. Worked in cents so that, for
 * example, 1000 − 0.1 − 0.9 gives exactly 999.
 */
export function externalAmountDue(payment: {
  amount: number | string | null;
  wallet_applied?: number | string | null;
  promo_discount?: number | string | null;
}): number {
  const cents = (v: number | string | null | undefined): number => Math.round(Number(v ?? 0) * 100);
  return (cents(payment.amount) - cents(payment.wallet_applied) - cents(payment.promo_discount)) / 100;
}

// ─── STK Push payload ─────────────────────────────────────────────────────────

/** Parameters for building an STK Push payload. */
export interface StkPushPayloadParams {
  /** Daraja Business Short Code (the paybill, or the Till's head-office/store number). */
  shortcode: string;
  /** Pre-built password (see `buildStkPassword`). */
  password: string;
  /** Timestamp in `YYYYMMDDHHmmss` format. */
  timestamp: string;
  /** Amount in KES. Must be whole shillings from 1 to 250,000 — never rounded. */
  amount: number;
  /** Normalized Kenyan MSISDN (e.g. `254712345678`). */
  phone: string;
  /** HTTPS URL Daraja will POST the result to. */
  callbackUrl: string;
  /** Short reference shown on the M-Pesa prompt (e.g. booking ID). */
  accountReference: string;
  /** Human-readable description of the transaction. */
  transactionDesc: string;
  /** Paybill (the default) or Till (Buy Goods). */
  transactionType?: StkTransactionType;
  /** Who receives the money. Defaults to the shortcode, as a Paybill always did. */
  partyB?: string;
}

/**
 * Build the STK Push request body object ready to JSON-serialize.
 *
 * Throws when the amount is not payable (see `checkMpesaAmount`), so the caller must check it
 * first. The old silent `Math.round` is gone on purpose.
 */
export function buildStkPushPayload(
  p: StkPushPayloadParams,
): Record<string, unknown> {
  const amountCheck = checkMpesaAmount(p.amount);
  if (!amountCheck.ok) {
    throw new Error(`STK amount refused: ${amountCheck.message}`);
  }

  return {
    BusinessShortCode: p.shortcode,
    Password: p.password,
    Timestamp: p.timestamp,
    TransactionType: p.transactionType ?? 'CustomerPayBillOnline',
    Amount: p.amount,
    PartyA: p.phone,
    PartyB: p.partyB ?? p.shortcode,
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

// ─── STK Push Query (P4a) ─────────────────────────────────────────────────────

/** Parameters for asking Daraja what happened to one STK request. */
export interface StkQueryParams {
  /** The same Business Short Code the STK Push used. */
  shortcode: string;
  /** Pre-built password (see `buildStkPassword`). */
  password: string;
  /** Timestamp in `YYYYMMDDHHmmss` format. */
  timestamp: string;
  /** The CheckoutRequestID to look up. */
  checkoutRequestId: string;
}

/**
 * Build an STK Push Query request descriptor. Does NOT call fetch.
 *
 * URL: `${baseUrl}/mpesa/stkpushquery/v1/query`
 */
export function buildStkQueryRequest(
  baseUrl: string,
  token: string,
  p: StkQueryParams,
): {
  url: string;
  method: 'POST';
  headers: Record<string, string>;
  body: Record<string, unknown>;
} {
  return {
    url: `${baseUrl}/mpesa/stkpushquery/v1/query`,
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: {
      BusinessShortCode: p.shortcode,
      Password: p.password,
      Timestamp: p.timestamp,
      CheckoutRequestID: p.checkoutRequestId,
    },
  };
}

/**
 * What an STK Push Query answer means for a success callback.
 *
 * - `success`: M-PESA confirms this request succeeded, so the callback may be applied.
 * - `not_successful`: a DEFINITE answer that the request did not succeed. Do not apply.
 * - `unknown_request`: a DEFINITE answer that M-PESA does not know this CheckoutRequestID.
 *   Do not apply.
 * - `indeterminate`: still processing, rate-limited, a network error, a non-2xx answer or
 *   anything we do not recognise. This is NEVER treated as a forgery: the caller retries a few
 *   times and then leaves the attempt to the normal timeout and reconciliation path (S40-2).
 */
export type StkQueryVerdict = 'success' | 'not_successful' | 'unknown_request' | 'indeterminate';

/**
 * ResultCodes that mean "the transaction is still being processed". They are NOT a final
 * "not successful" answer. Daraja answers a query that arrives too early with 4999.
 */
export const STK_QUERY_STILL_PROCESSING_CODES: readonly string[] = ['4999'];

/** Daraja's "Bad Request - Invalid ..." code. Definite only with a CheckoutRequestID message. */
const DARAJA_INVALID_REQUEST_ERROR_CODE = '400.002.02';

/** Read a Daraja code that may arrive as a string or a number. Anything else is null. */
function darajaCode(value: unknown): string | null {
  if (typeof value === 'string' && value.trim() !== '') return value.trim();
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return null;
}

/**
 * Decide what one STK Push Query answer means (P4a, S40-2). Every uncertain case is
 * `indeterminate`; only two narrow shapes are definite refusals.
 */
export function interpretStkQuery(r: DarajaHttpResult, checkoutRequestId: string): StkQueryVerdict {
  const body = r.body;

  if (!r.ok) {
    // The one definite non-2xx answer: HTTP 400, Daraja's "invalid request" code, and a message
    // that names the CheckoutRequestID. Everything else (still processing, rate limits, server
    // errors, other bad requests such as a wrong shortcode) proves nothing about the payment.
    const message = body && typeof body['errorMessage'] === 'string' ? body['errorMessage'] : '';
    if (
      r.status === 400 &&
      darajaCode(body?.['errorCode']) === DARAJA_INVALID_REQUEST_ERROR_CODE &&
      /invalid\s*checkout\s*request\s*id/i.test(message)
    ) {
      return 'unknown_request';
    }
    return 'indeterminate';
  }

  // A 2xx answer only counts when the query itself was accepted (ResponseCode 0) and the answer
  // is about OUR request. A missing or different CheckoutRequestID proves nothing.
  if (!body) return 'indeterminate';
  if (darajaCode(body['ResponseCode']) !== '0') return 'indeterminate';
  if (body['CheckoutRequestID'] !== checkoutRequestId) return 'indeterminate';

  const resultCode = darajaCode(body['ResultCode']);
  if (resultCode === null || !/^\d+$/.test(resultCode)) return 'indeterminate';
  if (resultCode === '0') return 'success';
  if (STK_QUERY_STILL_PROCESSING_CODES.includes(resultCode)) return 'indeterminate';
  return 'not_successful';
}

/** How many times the callback asks Daraja before giving up (the first try included). */
export const STK_QUERY_MAX_TRIES = 3;

/** Pauses between tries, in milliseconds (one fewer than the number of tries). */
export const STK_QUERY_RETRY_DELAYS_MS: readonly number[] = [2000, 4000];

/**
 * Ask Daraja, with a bounded retry, whether a success callback is real (P4a, S40-2).
 *
 * - A definite answer (`success`, `not_successful`, `unknown_request`) is returned at once.
 * - An indeterminate answer, or a thrown error (network, timeout, OAuth failure), is retried
 *   after the next delay, up to `STK_QUERY_MAX_TRIES` tries in total.
 * - If every try is indeterminate the result is `indeterminate`, never a refusal.
 *
 * `query` and `sleep` are passed in so this stays pure and every branch can be unit-tested.
 */
export async function confirmStkSuccess(deps: {
  query: () => Promise<DarajaHttpResult>;
  checkoutRequestId: string;
  sleep: (ms: number) => Promise<void>;
}): Promise<{ verdict: StkQueryVerdict; tries: number }> {
  for (let tries = 1; tries <= STK_QUERY_MAX_TRIES; tries++) {
    let verdict: StkQueryVerdict;
    try {
      verdict = interpretStkQuery(await deps.query(), deps.checkoutRequestId);
    } catch {
      // Could not ask at all (network, timeout, OAuth). That says nothing about the payment.
      verdict = 'indeterminate';
    }

    if (verdict !== 'indeterminate') {
      return { verdict, tries };
    }
    if (tries < STK_QUERY_MAX_TRIES) {
      await deps.sleep(STK_QUERY_RETRY_DELAYS_MS[tries - 1]);
    }
  }
  return { verdict: 'indeterminate', tries: STK_QUERY_MAX_TRIES };
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
  // Only a whole number is a result code (S43-2): 0.4 or 1.5 is read as "no result code", so it can
  // never reach the database as one. mpesa-callback classifies such a body as malformed evidence.
  const resultCode =
    typeof cb['ResultCode'] === 'number' && Number.isInteger(cb['ResultCode']) ? cb['ResultCode'] : null;
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

// ─── Mock STK result ──────────────────────────────────────────────────────────

/** Synchronous mock result returned when `MPESA_MODE=mock` (never on Production). */
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
 * Used by the Edge Function when `MPESA_MODE=mock` on a non-Production project.
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
