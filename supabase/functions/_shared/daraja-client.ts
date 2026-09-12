/**
 * daraja-client.ts — Deno HTTP client for the Daraja (M-Pesa) API.
 *
 * Wraps the pure helpers from `daraja.ts` with real fetch calls and
 * reads credentials from Deno.env (set via `supabase secrets set …`).
 *
 * This file uses Deno-only globals and is excluded from the app tsconfig.
 */

import { buildOAuthRequest, buildStkPushRequest } from './daraja.ts';

/** In-memory OAuth token cache. Resets on cold-start. */
let cached: { token: string; expiresAt: number } | null = null;

/**
 * Fetch (or return a cached) OAuth bearer token from Daraja.
 *
 * Subtracts 60 s from the token lifetime so we refresh slightly before
 * the token actually expires, avoiding race conditions.
 */
export async function getOAuthToken(): Promise<string> {
  if (cached && Date.now() < cached.expiresAt) return cached.token;

  const base = Deno.env.get('DARAJA_BASE_URL')!;
  const r = buildOAuthRequest(
    base,
    Deno.env.get('DARAJA_CONSUMER_KEY')!,
    Deno.env.get('DARAJA_CONSUMER_SECRET')!,
  );

  const res = await fetch(r.url, { method: r.method, headers: r.headers });
  const j = await res.json();

  cached = {
    token: j.access_token,
    expiresAt: Date.now() + (Number(j.expires_in ?? 3600) - 60) * 1000,
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
 */
export type StkPushResult = {
  /** True only for a 2xx HTTP response. */
  ok: boolean;
  /** HTTP status code returned by Daraja (0 is never produced; fetch throws instead). */
  status: number;
  /** Parsed JSON body, or null when the response body was not valid JSON. */
  body: Record<string, unknown> | null;
};

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
  const base = Deno.env.get('DARAJA_BASE_URL')!;
  const r = buildStkPushRequest(base, token, payload);

  const res = await fetch(r.url, {
    method: r.method,
    headers: r.headers,
    body: JSON.stringify(r.body),
  });

  let body: Record<string, unknown> | null = null;
  try {
    body = await res.json();
  } catch {
    // A non-JSON body (gateway HTML page, empty body) tells us nothing about collection.
    body = null;
  }

  return { ok: res.ok, status: res.status, body };
}
