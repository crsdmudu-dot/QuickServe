/**
 * daraja-client.ts — Deno HTTP client for the Daraja (M-Pesa) API.
 *
 * Wraps the pure helpers from `daraja.ts` with real fetch calls and
 * reads credentials from Deno.env (set via `supabase secrets set …`).
 *
 * This file uses Deno-only globals and is excluded from the app tsconfig.
 *
 * Update 50 (live hardening):
 *   - P5: `getOAuthToken` checks the HTTP status and that a token is present, and never caches
 *     a failure;
 *   - P4a: `stkQuery` asks Daraja what happened to one STK request (STK Push Query), so
 *     mpesa-callback can confirm a success before applying it.
 */

import {
  buildOAuthRequest,
  buildStkPassword,
  buildStkPushRequest,
  buildStkQueryRequest,
  darajaBaseUrl,
  darajaTimestamp,
  readOAuthAnswer,
  type DarajaHttpResult,
} from './daraja.ts';

/** How long one OAuth or STK Push Query request may take before it is abandoned. */
const DARAJA_REQUEST_TIMEOUT_MS = 5000;

/** In-memory OAuth token cache. Resets on cold-start. Only a real token is ever cached. */
let cached: { token: string; expiresAt: number } | null = null;

/**
 * Parse a response body as JSON. Returns null instead of throwing when the body is not JSON:
 * a gateway HTML page or an empty body tells us nothing.
 */
async function readJson(res: Response): Promise<Record<string, unknown> | null> {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

/**
 * Fetch (or return a cached) OAuth bearer token from Daraja.
 *
 * P5: the HTTP status is checked and a token must be present. Any failure THROWS and is never
 * cached, so the next request asks Daraja again instead of reusing a missing token for about an
 * hour. Error messages never contain the consumer key, the secret or a token.
 *
 * Subtracts 60 s from the token lifetime so we refresh slightly before
 * the token actually expires, avoiding race conditions.
 */
export async function getOAuthToken(): Promise<string> {
  if (cached && Date.now() < cached.expiresAt) return cached.token;

  const r = buildOAuthRequest(
    darajaBaseUrl(Deno.env.get('DARAJA_BASE_URL')),
    Deno.env.get('DARAJA_CONSUMER_KEY') ?? '',
    Deno.env.get('DARAJA_CONSUMER_SECRET') ?? '',
  );

  const res = await fetch(r.url, {
    method: r.method,
    headers: r.headers,
    signal: AbortSignal.timeout(DARAJA_REQUEST_TIMEOUT_MS),
  });

  const answer = readOAuthAnswer({ ok: res.ok, status: res.status, body: await readJson(res) });
  if (!answer.ok) {
    throw new Error(`Daraja ${answer.problem}`);
  }

  cached = {
    token: answer.token,
    expiresAt: Date.now() + (answer.expiresInSeconds - 60) * 1000,
  };

  return cached.token;
}

/**
 * Outcome of an STK Push submission, with the HTTP transport status preserved.
 *
 * The caller MUST be able to tell a real Daraja answer apart from a transport failure.
 * Collapsing the two (by returning only the parsed body) makes an HTTP 5xx that happens to
 * carry a JSON body look like an ordinary application rejection, which is not safe for money:
 * the request was still transmitted and the customer may still be charged.
 *
 * - `ok`: true only for a 2xx HTTP response.
 * - `status`: the HTTP status code returned by Daraja (0 is never produced; fetch throws instead).
 * - `body`: the parsed JSON body, or null when the response body was not valid JSON.
 */
export type StkPushResult = DarajaHttpResult;

/**
 * Send an STK Push request to the Daraja API.
 *
 * @param token   - Bearer token obtained from `getOAuthToken()`.
 * @param payload - Pre-built payload from `buildStkPushPayload()`.
 * @returns The HTTP status, an ok flag and the parsed body (null if unparseable).
 *
 * A network-level failure still throws, which the caller treats as ambiguous. A non-2xx
 * response does NOT throw: it is returned with its status so the caller can refuse to draw a
 * conclusion from it. No credential is ever placed in the returned structure.
 */
export async function stkPush(
  token: string,
  payload: Record<string, unknown>,
): Promise<StkPushResult> {
  const base = darajaBaseUrl(Deno.env.get('DARAJA_BASE_URL'));
  const r = buildStkPushRequest(base, token, payload);

  const res = await fetch(r.url, {
    method: r.method,
    headers: r.headers,
    body: JSON.stringify(r.body),
  });

  return { ok: res.ok, status: res.status, body: await readJson(res) };
}

/**
 * Ask Daraja what happened to one STK request: the STK Push Query (P4a).
 *
 * Uses the same shortcode and passkey as the STK Push. Returns the HTTP status and the parsed
 * body, like `stkPush`; the pure `interpretStkQuery` decides what they mean.
 *
 * A missing setting, an OAuth failure, a timeout or a network failure THROWS. The caller treats
 * that as indeterminate (retry, then the timeout path), never as a forgery.
 */
export async function stkQuery(checkoutRequestId: string): Promise<DarajaHttpResult> {
  const base = darajaBaseUrl(Deno.env.get('DARAJA_BASE_URL'));
  const shortcode = Deno.env.get('DARAJA_SHORTCODE') ?? '';
  const passkey = Deno.env.get('DARAJA_PASSKEY') ?? '';
  if (base === '' || shortcode === '' || passkey === '') {
    throw new Error('Daraja settings are missing for the STK Push Query');
  }

  const token = await getOAuthToken();
  const timestamp = darajaTimestamp(new Date());
  const r = buildStkQueryRequest(base, token, {
    shortcode,
    password: buildStkPassword(shortcode, passkey, timestamp),
    timestamp,
    checkoutRequestId,
  });

  const res = await fetch(r.url, {
    method: r.method,
    headers: r.headers,
    body: JSON.stringify(r.body),
    signal: AbortSignal.timeout(DARAJA_REQUEST_TIMEOUT_MS),
  });

  return { ok: res.ok, status: res.status, body: await readJson(res) };
}
