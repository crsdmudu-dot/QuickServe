/**
 * mpesa-callback/index.ts — Supabase Edge Function (Deno).
 *
 * Receives the asynchronous STK Push result from Daraja and hands it off
 * to the `apply_mpesa_callback` database RPC (defined in migration 0012).
 *
 * Security: JWT verification is DISABLED (verify_jwt = false in config.toml)
 * because Daraja cannot supply a Supabase JWT. Safaricom's STK callback also
 * cannot send custom request headers or an HMAC body signature — it POSTs to
 * whatever CallBackURL was registered — so the ONLY authentication channel
 * Daraja's callback supports is a secret carried in the URL. We therefore gate
 * access with a high-entropy shared secret (`?token=<MPESA_CALLBACK_SECRET>`),
 * compared in constant time, and reject when the secret is unset.
 *
 * Because a URL-borne secret can leak via logs/proxies, defence-in-depth is
 * required (see docs/superpowers/verification/slice-13-daraja.md):
 *   - use a long random secret and ROTATE it periodically;
 *   - restrict the function to Safaricom's callback IP ranges (allowlist);
 *   - `apply_mpesa_callback` is idempotent and only acts on an existing pending
 *     attempt, so a replayed/leaked token cannot fabricate a payment.
 *
 * This function ALWAYS returns HTTP 200 with { ResultCode: 0 } so Daraja
 * does not retry. Real success/failure is determined by `ResultCode` in the body,
 * not the HTTP status we send back.
 */

import { createClient } from 'jsr:@supabase/supabase-js@2';
import { parseStkCallback } from '../_shared/daraja.ts';

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

Deno.serve(async (req: Request) => {
  // 1. Token-gate: constant-time check of the shared secret in the query string.
  //    Reject when the secret is unset/empty so a missing config never authorizes.
  const url = new URL(req.url);
  const token = url.searchParams.get('token') ?? '';
  const expected = Deno.env.get('MPESA_CALLBACK_SECRET') ?? '';
  if (expected.length === 0 || !safeEqual(token, expected)) {
    return new Response('Unauthorized', { status: 401 });
  }

  // 2. Parse the Daraja callback body (null-safe).
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    body = null;
  }

  const p = parseStkCallback(body);

  // 3. If we got a checkoutRequestId, update the database via service-role RPC.
  if (p.checkoutRequestId) {
    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    await admin.rpc('apply_mpesa_callback', {
      p_checkout_request_id: p.checkoutRequestId,
      p_merchant_request_id: p.merchantRequestId,
      p_result_code: p.resultCode,
      p_result_desc: p.resultDesc,
      p_raw: body,
    });
  }

  // 4. Always acknowledge with 200 so Daraja does not retry.
  return new Response(
    JSON.stringify({ ResultCode: 0, ResultDesc: 'Accepted' }),
    {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    },
  );
});
