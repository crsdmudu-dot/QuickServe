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
 * Success confirmation (P4a + S40-2, update 50): the URL token alone is not proof, because anyone
 * holding it could forge a success. So a callback the database WOULD settle (it has a
 * CheckoutRequestID and ResultCode exactly 0) is first confirmed with Safaricom through an STK
 * Push Query, with a bounded retry (`confirmStkSuccess`):
 *   - `success`                          → handled by the database exactly as before;
 *   - `unknown_request` (DEFINITE)       → NOT applied; recorded as orphan evidence with the
 *     existing 0054 classification `unknown_checkout_request_id` (which raises the existing admin
 *     alert), then answered 409 (lead-PM S43-1(a));
 *   - `not_successful` (DEFINITE)        → NOT applied and NOT recorded (no 0054 classification
 *     fits a known request that failed); answered 409. The real attempt keeps its state and
 *     follows the timeout path;
 *   - `indeterminate` (still processing, rate-limited, unreachable, any unrecognised answer, even
 *     after the retries) → NEVER treated as a forgery: NOT applied, answered 500 so Safaricom
 *     may redeliver, and the attempt follows the existing timeout → alert → portal
 *     reconciliation path.
 * Failure callbacks and bodies without a CheckoutRequestID are not queried: they cannot settle
 * anything, so they reach the database unchanged. A body whose ResultCode is present but not a
 * plain whole number (S43-2) is malformed evidence, exactly like any other malformed body.
 * This function never reads MPESA_MODE, so
 * requests already sent still settle after payments are switched to `disabled`.
 *
 * Nothing in this function logs the body, the phone number or the token.
 */

import { createClient } from 'jsr:@supabase/supabase-js@2';
import { confirmStkSuccess, parseStkCallback } from '../_shared/daraja.ts';
import { stkQuery } from '../_shared/daraja-client.ts';
import { classifyAuthenticatedCallback, parseJsonBody, sha256Hex } from '../_shared/callback-evidence.ts';

/** Wait for the given number of milliseconds (used between STK Push Query retries). */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

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
  //        value, extracts/masks evidence from it, and fingerprints its canonical form;
  //      - (S43-2) a ResultCode that is present but not a plain whole number (0.4, "0.0", 1e0…)
  //        makes the body malformed evidence too: never applied, and its ResultCode is never sent
  //        to the database. The raw text is passed so a number WRITTEN as 1e0 or 0.0 is caught.
  const parsed = parseJsonBody(rawText);
  const body: unknown = parsed.ok ? parsed.body : null;
  const rawSha = parsed.ok ? null : await sha256Hex(new TextEncoder().encode(rawText));
  const p = parseStkCallback(body);
  const classification = rawSha
    ? 'malformed_authenticated_callback'
    : classifyAuthenticatedCallback(body, p, rawText);

  // The service-role client. Creating it opens no connection; the first RPC below does.
  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  // 4. P4a — confirm a SUCCESS claim with Safaricom before the database sees it. Only a callback
  //    the database would settle is queried: it carries a CheckoutRequestID ('apply') and
  //    ResultCode exactly 0 (0050 treats anything else, including null, as a failure).
  if (classification === 'apply' && p.resultCode === 0 && p.checkoutRequestId) {
    const checkoutRequestId = p.checkoutRequestId;
    const confirmation = await confirmStkSuccess({
      query: () => stkQuery(checkoutRequestId),
      checkoutRequestId,
      sleep,
    });

    if (confirmation.verdict === 'indeterminate') {
      // NOT a forgery verdict (S40-2): M-PESA could not give a definite answer even after the
      // bounded retries. Nothing is written. Refuse the ACK so Safaricom may redeliver; the
      // attempt stays blocking and follows the timeout → alert → portal reconciliation path.
      console.warn('mpesa-callback: success not yet confirmed by M-PESA after retries; answered 500.');
      return json({ ResultCode: 1, ResultDesc: 'Success not yet confirmed with M-PESA; retry' }, 500);
    }

    if (confirmation.verdict === 'unknown_request') {
      // DEFINITE answer: M-PESA does not know this CheckoutRequestID, so the success claim is
      // false and is NOT applied. S43-1(a): it is RECORDED first as orphan evidence with the
      // existing 0054 classification 'unknown_checkout_request_id', which also raises the existing
      // "Unmatched M-PESA success callback — investigate" admin alert. record_mpesa_callback_event
      // only writes an evidence row (and the alert); it never touches an attempt or a payment.
      // It is called DIRECTLY — never apply_or_record_mpesa_callback, which could settle a known id.
      const { error: recordError } = await admin.rpc('record_mpesa_callback_event', {
        p_classification: 'unknown_checkout_request_id',
        p_checkout_request_id: checkoutRequestId,
        p_merchant_request_id: p.merchantRequestId,
        p_result_code: p.resultCode,
        p_result_desc: p.resultDesc,
        p_raw: body,
        p_raw_sha256: null,
      });
      if (recordError) {
        // Not durably recorded: refuse the ACK so a redelivery can record it (still never applied).
        return json({ ResultCode: 1, ResultDesc: 'Callback not durably handled; retry' }, 500);
      }
      console.warn('mpesa-callback: success claim refused; M-PESA answered unknown_request; recorded as evidence.');
      return json({ ResultCode: 1, ResultDesc: 'Success not confirmed by M-PESA; not applied' }, 409);
    }

    if (confirmation.verdict !== 'success') {
      // DEFINITE answer: M-PESA says this request did not succeed. The claim is false, so it is
      // NOT applied (a forged success must never mark a payment paid). It is not recorded either:
      // none of the 0054 evidence classifications describes "a known request that failed", and
      // adding one needs a migration. The real attempt keeps its state and follows the normal
      // timeout path; this log line is the signal.
      console.warn(`mpesa-callback: success claim refused; M-PESA answered ${confirmation.verdict}.`);
      return json({ ResultCode: 1, ResultDesc: 'Success not confirmed by M-PESA; not applied' }, 409);
    }
  }

  // 5. Durable handling. Known attempt → certified apply path; anything else → evidence row.
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
          // A malformed body never passes a result code on (S43-2: 1e0 parses as 1, for example).
          p_result_code: classification === 'malformed_authenticated_callback' ? null : p.resultCode,
          p_result_desc: p.resultDesc,
          p_raw: rawSha ? null : body,
          p_raw_sha256: rawSha,
        });

  if (error) {
    // Not durably handled: refuse the ACK so Daraja retries. Message text only — never the body.
    return json({ ResultCode: 1, ResultDesc: 'Callback not durably handled; retry' }, 500);
  }

  // 6. Acknowledge only after durable handling succeeded.
  return json({ ResultCode: 0, ResultDesc: 'Accepted' }, 200);
});
