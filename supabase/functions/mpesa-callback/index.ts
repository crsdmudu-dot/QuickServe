/**
 * mpesa-callback/index.ts — Supabase Edge Function (Deno).
 *
 * Receives the asynchronous STK Push result from Daraja and hands it off
 * to the `apply_mpesa_callback` database RPC (defined in migration 0012).
 *
 * Security: JWT verification is DISABLED (verify_jwt = false in config.toml)
 * because Daraja cannot supply a Supabase JWT. Instead, we gate access with a
 * shared secret passed as `?token=<MPESA_CALLBACK_SECRET>` in the callback URL.
 *
 * This function ALWAYS returns HTTP 200 with { ResultCode: 0 } so Daraja
 * does not retry. Real success/failure is determined by `ResultCode` in the body,
 * not the HTTP status we send back.
 */

import { createClient } from 'jsr:@supabase/supabase-js@2';
import { parseStkCallback } from '../_shared/daraja.ts';

Deno.serve(async (req: Request) => {
  // 1. Token-gate: verify the shared secret in the query string.
  const url = new URL(req.url);
  if (url.searchParams.get('token') !== Deno.env.get('MPESA_CALLBACK_SECRET')) {
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
