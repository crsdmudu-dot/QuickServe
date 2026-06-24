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
 * Send an STK Push request to the Daraja API.
 *
 * @param token   - Bearer token obtained from `getOAuthToken()`.
 * @param payload - Pre-built payload from `buildStkPushPayload()`.
 * @returns Daraja JSON response object.
 */
export async function stkPush(
  token: string,
  payload: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const base = Deno.env.get('DARAJA_BASE_URL')!;
  const r = buildStkPushRequest(base, token, payload);

  const res = await fetch(r.url, {
    method: r.method,
    headers: r.headers,
    body: JSON.stringify(r.body),
  });

  return await res.json();
}
