/**
 * mpesa-stk-push/index.ts — Supabase Edge Function (Deno).
 *
 * Initiates an M-Pesa STK Push for a pending payment.
 *
 * Security: JWT verification is ENABLED (verify_jwt = true in config.toml).
 * The caller must supply a valid Supabase user JWT in the Authorization header.
 *
 * Flow:
 *  1. Validate request body (payment_id, phone).
 *  2. Confirm ownership + state via RLS (payment pending, booking completed).
 *  3. Call Daraja (or return mock result in mock mode).
 *  4. Record a `payment_attempts` row via the service-role client.
 *  5. Return { ok: true, checkoutRequestId, status: 'pending' }.
 *
 * NOTE: This function NEVER sets the payment to "paid". That happens only
 * when Daraja sends a successful callback to the mpesa-callback function.
 */

import { createClient } from 'jsr:@supabase/supabase-js@2';
import {
  buildStkPassword,
  buildStkPushPayload,
  darajaTimestamp,
  isMockMode,
  isMsisdn,
  mockStkResult,
  resolveMpesaMode,
} from '../_shared/daraja.ts';
import { getOAuthToken, stkPush } from '../_shared/daraja-client.ts';

// ─── Helper ───────────────────────────────────────────────────────────────────

/** Send a JSON response with the given HTTP status code. */
function json(obj: unknown, status = 200): Response {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

// ─── Handler ──────────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  try {
    // 1. Parse and validate input.
    const authHeader = req.headers.get('Authorization') ?? '';
    let body: { payment_id?: unknown; phone?: unknown };
    try {
      body = await req.json();
    } catch {
      return json({ ok: false, error: 'Invalid request.' }, 400);
    }

    const { payment_id, phone } = body as { payment_id?: string; phone?: string };

    if (!payment_id || !isMsisdn(phone ?? '')) {
      return json({ ok: false, error: 'Invalid request.' }, 400);
    }

    // 2. User-scoped client (respects RLS — confirms ownership).
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    // 3a. Check payment: must belong to the user and be in 'pending' state.
    const { data: payment } = await userClient
      .from('payments')
      .select('id, amount, booking_id, status')
      .eq('id', payment_id)
      .maybeSingle();

    if (!payment || payment.status !== 'pending') {
      return json({ ok: false, error: 'Payment is not payable.' }, 400);
    }

    // 3b. Check booking: must be 'completed' (job done before payment).
    const { data: booking } = await userClient
      .from('bookings')
      .select('id, status')
      .eq('id', payment.booking_id)
      .maybeSingle();

    if (!booking || booking.status !== 'completed') {
      return json({ ok: false, error: 'Job is not completed yet.' }, 400);
    }

    // 4. Initiate STK Push (mock or real).
    const mode = resolveMpesaMode(Deno.env.get('MPESA_MODE'));

    let merchantRequestId: string;
    let checkoutRequestId: string;
    let raw: Record<string, unknown>;

    if (isMockMode(mode)) {
      // Mock mode — no Daraja secrets required.
      const m = mockStkResult({ phone: phone!, amount: payment.amount });
      merchantRequestId = m.merchantRequestId;
      checkoutRequestId = m.checkoutRequestId;
      raw = m.raw;
    } else {
      // Sandbox / live mode — hit the real Daraja API.
      const shortcode = Deno.env.get('DARAJA_SHORTCODE')!;
      const passkey = Deno.env.get('DARAJA_PASSKEY')!;
      const ts = darajaTimestamp(new Date());
      const password = buildStkPassword(shortcode, passkey, ts);
      const token = await getOAuthToken();
      const payload = buildStkPushPayload({
        shortcode,
        password,
        timestamp: ts,
        amount: payment.amount,
        phone: phone!,
        callbackUrl: Deno.env.get('DARAJA_CALLBACK_URL')!,
        accountReference: String(payment.booking_id).slice(0, 12),
        transactionDesc: 'QuickServe payment',
      });

      const resp = await stkPush(token, payload);
      merchantRequestId = resp.MerchantRequestID as string;
      checkoutRequestId = resp.CheckoutRequestID as string;
      raw = resp;

      if (resp.ResponseCode !== '0') {
        return json(
          {
            ok: false,
            error: (resp.ResponseDescription as string) ?? 'STK push failed.',
          },
          400,
        );
      }
    }

    // 5. Record the attempt via the service-role client (bypasses RLS).
    const admin = createClient(supabaseUrl, serviceRoleKey);
    const { error: insertError } = await admin.from('payment_attempts').insert({
      payment_id,
      provider: 'mpesa',
      phone,
      amount: payment.amount,
      status: 'pending',
      external_reference: checkoutRequestId,
      raw_response: raw,
      merchant_request_id: merchantRequestId,
      checkout_request_id: checkoutRequestId,
    });

    if (insertError) {
      return json({ ok: false, error: 'Could not record attempt.' }, 500);
    }

    // 6. Success — the client polls or waits for the push notification.
    return json({ ok: true, checkoutRequestId, status: 'pending' });
  } catch {
    return json({ ok: false, error: 'Unexpected error.' }, 500);
  }
});
