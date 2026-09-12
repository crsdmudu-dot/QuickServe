/**
 * mpesa-stk-push/index.ts — Supabase Edge Function (Deno).
 *
 * Initiates an M-Pesa STK Push for a pending payment.
 *
 * Security: JWT verification is ENABLED (verify_jwt = true in config.toml).
 * The caller must supply a valid Supabase user JWT in the Authorization header.
 *
 * Flow (RESERVE BEFORE PROVIDER — migration 0045):
 *  1. Validate request body (payment_id, phone).
 *  2. Confirm ownership + state via RLS (payment pending, booking completed).
 *  3. RESERVE the attempt first via reserve_mpesa_attempt: the RPC locks the payment row,
 *     derives the amount from the CURRENT external due, enforces the one-blocking-attempt
 *     invariant, and creates the row as 'initiated'.
 *  4. Only then call Daraja (or the mock).
 *  5. Definitive acceptance  -> mark_attempt_accepted  (initiated -> pending)
 *     Definitive rejection   -> mark_attempt_failed    (initiated -> failed, retry allowed)
 *     Transport ambiguity    -> leave it 'initiated'   (NEVER mark failed)
 *  6. Return { ok: true, checkoutRequestId, status: 'pending' }.
 *
 * Why reserve first: previously Daraja was called and the row inserted afterwards, so two
 * concurrent invocations could both reach Daraja before either row existed — two live STK
 * requests against one payment, with nothing recorded. Reserving first makes that impossible.
 * The cost is that an ambiguous initiation leaves an 'initiated' row holding the funding-mix
 * freeze; the existing cron ages it to 'timed_out', which stays blocking until a valid callback
 * settles it or an admin records an evidenced no-collection reconciliation. There is no
 * automatic retry merely because an attempt timed out.
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
import { getOAuthToken, stkPush, type StkPushResult } from '../_shared/daraja-client.ts';

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
      .select('id, amount, wallet_applied, promo_discount, booking_id, status')
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

    // 3c. RESERVE the attempt BEFORE contacting Daraja.
    // The RPC locks the payment row, recomputes external_due under that lock, enforces the
    // one-blocking-attempt invariant and rejects a zero-due payment. The amount is decided
    // server-side; this function never computes it.
    const admin = createClient(supabaseUrl, serviceRoleKey);

    const { data: reservation, error: reserveError } = await admin
      .rpc('reserve_mpesa_attempt', { p_payment_id: payment_id, p_phone: phone })
      .maybeSingle();

    if (reserveError || !reservation) {
      // Reservation failed — Daraja has NOT been contacted and no attempt exists.
      return json({ ok: false, error: 'Could not start payment.' }, 400);
    }

    const attemptId = (reservation as { attempt_id: string }).attempt_id;
    const amountDue = Number((reservation as { amount: number | string }).amount);

    // 4. Initiate STK Push (mock or real). From here an attempt row EXISTS, so every exit path
    //    must resolve it deliberately: accepted, definitively failed, or left 'initiated'.
    const mode = resolveMpesaMode(Deno.env.get('MPESA_MODE'));

    let merchantRequestId: string;
    let checkoutRequestId: string;
    let raw: Record<string, unknown>;

    if (isMockMode(mode)) {
      // Mock mode — no Daraja secrets required.
      const m = mockStkResult({ phone: phone!, amount: amountDue });
      merchantRequestId = m.merchantRequestId;
      checkoutRequestId = m.checkoutRequestId;
      raw = m.raw;
    } else {
      // Sandbox / live mode — hit the real Daraja API.
      const shortcode = Deno.env.get('DARAJA_SHORTCODE')!;
      const passkey = Deno.env.get('DARAJA_PASSKEY')!;
      const ts = darajaTimestamp(new Date());
      const password = buildStkPassword(shortcode, passkey, ts);

      let result: StkPushResult;
      try {
        const token = await getOAuthToken();
        const payload = buildStkPushPayload({
          shortcode,
          password,
          timestamp: ts,
          amount: amountDue,
          phone: phone!,
          callbackUrl: Deno.env.get('DARAJA_CALLBACK_URL')!,
          accountReference: String(payment.booking_id).slice(0, 12),
          transactionDesc: 'QuickServe payment',
        });
        result = await stkPush(token, payload);
      } catch {
        // TRANSPORT AMBIGUITY — the request may or may not have reached Daraja. Do NOT mark the
        // attempt failed: that would release the funding freeze and permit a retry while the
        // customer could still be charged. Leave it 'initiated' for the cron to age to
        // 'timed_out', which stays blocking until a callback or an evidenced reconciliation.
        return json({ ok: false, error: 'Payment status unknown. Please check before retrying.' }, 502);
      }

      // TRANSPORT-LEVEL FAILURE (5xx, 429, 408, any non-2xx). The request left this function and
      // Daraja may still have queued the prompt, so the outcome is NOT proven. A JSON error body
      // on a non-2xx response is evidence, never a rejection. Never mark failed here.
      if (!result.ok) {
        return json({ ok: false, error: 'Payment status unknown. Please check before retrying.' }, 502);
      }

      const resp = result.body;

      // 2xx with an unparseable or absent body proves nothing either way.
      if (!resp) {
        return json({ ok: false, error: 'Payment status unknown. Please check before retrying.' }, 502);
      }

      // Daraja documents ResponseCode as a string, but accept a numeric form too rather than
      // reading a missing code into a rejection. Absent or malformed => ambiguous, never failed.
      const rawCode = resp.ResponseCode;
      const responseCode =
        typeof rawCode === 'string' || typeof rawCode === 'number' ? String(rawCode) : null;

      if (responseCode !== null && responseCode !== '0') {
        // DEFINITIVE application-level rejection: Daraja answered on a 2xx with an explicit
        // non-zero code. No live checkout exists, so the attempt may be failed and the funding
        // mix released for a retry.
        await admin.rpc('mark_attempt_failed', {
          p_attempt_id: attemptId,
          p_reason: (resp.ResponseDescription as string) ?? 'STK push rejected',
          p_raw: resp,
        });
        return json(
          {
            ok: false,
            error: (resp.ResponseDescription as string) ?? 'STK push failed.',
          },
          400,
        );
      }

      if (responseCode === null) {
        // 2xx but no usable ResponseCode: Daraja did not tell us what it did. AMBIGUOUS.
        return json({ ok: false, error: 'Payment status unknown. Please check before retrying.' }, 502);
      }

      merchantRequestId = resp.MerchantRequestID as string;
      checkoutRequestId = resp.CheckoutRequestID as string;
      raw = resp;

      if (!merchantRequestId || !checkoutRequestId) {
        // Accepted per ResponseCode but no usable identifiers: we cannot correlate a future
        // callback. Treat as AMBIGUOUS, never as failure, and never invent an identifier.
        return json({ ok: false, error: 'Payment status unknown. Please check before retrying.' }, 502);
      }
    }

    // 5. DEFINITIVE acceptance — move initiated -> pending and persist provider identifiers.
    const { error: acceptError } = await admin.rpc('mark_attempt_accepted', {
      p_attempt_id: attemptId,
      p_merchant_request_id: merchantRequestId,
      p_checkout_request_id: checkoutRequestId,
      p_raw: raw,
    });

    if (acceptError) {
      // Daraja accepted but we failed to record it. Do NOT retry Daraja and do NOT create a
      // second attempt — the 'initiated' row stands as reconciliation evidence.
      return json({ ok: false, error: 'Payment started but could not be recorded.' }, 500);
    }

    // 6. Success — the client polls or waits for the push notification.
    return json({ ok: true, checkoutRequestId, status: 'pending' });
  } catch {
    return json({ ok: false, error: 'Unexpected error.' }, 500);
  }
});
