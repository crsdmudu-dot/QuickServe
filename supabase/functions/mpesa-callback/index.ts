/**
 * mpesa-callback/index.ts — Supabase Edge Function (Deno).
 *
 * Receives the asynchronous STK Push result from Daraja and hands it to the database:
 *   - a callback whose CheckoutRequestID matches an attempt goes through the CERTIFIED
 *     `apply_mpesa_callback` path (0050), reached via `apply_or_record_mpesa_callback` (0054);
 *   - an authenticated callback that matches no attempt, has no CheckoutRequestID, or is not
 *     Daraja-shaped is durably recorded as evidence (`record_mpesa_callback_event`, 0054) for
 *     operator investigation. Orphan evidence never settles anything.
 *
 * Security: JWT verification is DISABLED (verify_jwt = false in config.toml) because Daraja
 * cannot supply a Supabase JWT, and its callback cannot carry custom headers or a body signature.
 * The ONLY authentication channel is the high-entropy shared secret in the URL
 * (`?token=<MPESA_CALLBACK_SECRET>`), compared in constant time and rejected when unset. Traffic
 * that fails that check gets 401 and creates NO evidence and NO alert — an attacker cannot fill
 * the operational queue with callback-shaped JSON.
 *
 * Durable-before-ack (0054): an authenticated callback is acknowledged with 200 only after the
 * database call that applies or records it has succeeded. If that call fails, the function
 * answers 500 so Safaricom redelivers; both database paths are idempotent (0050 for known
 * attempts, fingerprint dedup for evidence), so redelivery is safe and cannot double-settle.
 *
 * Bytes that are not JSON at all are still retained (SHA-256 of the raw bytes only — never the
 * bytes), so an authenticated request is never acknowledged without evidence.
 *
 * Nothing in this function logs the body, the phone number or the token.
 */

import { createClient } from 'jsr:@supabase/supabase-js@2';
import { parseStkCallback } from '../_shared/daraja.ts';
import { classifyAuthenticatedCallback, parseJsonBody, sha256Hex } from '../_shared/callback-evidence.ts';

/** Length-checked constant-time string comparison (avoids token timing leaks). */
function safeEqual(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const ab = enc.encode(a);
  const bb = enc.encode(b);
  if (ab.length !== bb.length) return false;
  let diff = 0;
  for (let i = 0; i < ab.length; i++) diff |= ab[i] ^ bb[i];
  return diff === 0;
}

function json(payload: Record<string, unknown>, status: number): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req: Request) => {
  // 1. Token-gate FIRST: constant-time check of the shared secret in the query string.
  //    Reject when the secret is unset/empty so a missing config never authorizes. No database
  //    access, no evidence, no alert before this point.
  const url = new URL(req.url);
  const token = url.searchParams.get('token') ?? '';
  const expected = Deno.env.get('MPESA_CALLBACK_SECRET') ?? '';
  if (expected.length === 0 || !safeEqual(token, expected)) {
    return new Response('Unauthorized', { status: 401 });
  }

  // 2. Read the raw bytes. If they cannot even be read there is nothing to retain, so refuse the
  //    ACK before touching the database and let Daraja redeliver.
  let rawText: string;
  try {
    rawText = await req.text();
  } catch {
    return json({ ResultCode: 1, ResultDesc: 'Callback body unreadable; retry' }, 500);
  }

  // 3. Parse and classify. Two different situations are kept apart:
  //      - bytes that are not JSON at all → recorded as malformed with ONLY the SHA-256 of the
  //        raw bytes (p_raw null; the bytes are never sent to or stored in the database);
  //      - valid JSON that is not a usable Daraja callback → the database receives the parsed
  //        value, extracts/masks evidence from it, and fingerprints its canonical form.
  const parsed = parseJsonBody(rawText);
  const body: unknown = parsed.ok ? parsed.body : null;
  const rawSha = parsed.ok ? null : await sha256Hex(new TextEncoder().encode(rawText));
  const p = parseStkCallback(body);
  const classification = rawSha
    ? 'malformed_authenticated_callback'
    : classifyAuthenticatedCallback(body, p);

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  // 4. Durable handling. Known attempt → certified apply path; anything else → evidence row.
  //    Both are single service-role RPCs; the parsed body only ever travels to the database,
  //    where the evidence path extracts fields and masks the phone without persisting the payload.
  const { error } =
    classification === 'apply'
      ? await admin.rpc('apply_or_record_mpesa_callback', {
          p_checkout_request_id: p.checkoutRequestId,
          p_merchant_request_id: p.merchantRequestId,
          p_result_code: p.resultCode,
          p_result_desc: p.resultDesc,
          p_raw: body,
        })
      : await admin.rpc('record_mpesa_callback_event', {
          p_classification: classification,
          p_checkout_request_id: null,
          p_merchant_request_id: p.merchantRequestId,
          p_result_code: p.resultCode,
          p_result_desc: p.resultDesc,
          p_raw: rawSha ? null : body,
          p_raw_sha256: rawSha,
        });

  if (error) {
    // Not durably handled: refuse the ACK so Daraja retries. Message text only — never the body.
    return json({ ResultCode: 1, ResultDesc: 'Callback not durably handled; retry' }, 500);
  }

  // 5. Acknowledge only after durable handling succeeded.
  return json({ ResultCode: 0, ResultDesc: 'Accepted' }, 200);
});
