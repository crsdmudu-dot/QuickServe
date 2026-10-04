/**
 * mpesa-stk-push/index.ts — Supabase Edge Function (Deno).
 *
 * Initiates an M-Pesa STK Push for a pending payment.
 *
 * Security: JWT verification is ENABLED (verify_jwt = true in config.toml).
 * The caller must supply a valid Supabase user JWT in the Authorization header.
 *
 * Flow (RESERVE BEFORE PROVIDER — migration 0045; live hardening — update 50):
 *  0. MODE FIRST (P1, S40-10). `MPESA_MODE` is read before anything else.
 *     - `disabled`, and also unset, empty or unknown values, answer 503 `payments_unavailable`.
 *     - `mock` on the Production project is refused in code and behaves as `disabled`.
 *     - `sandbox` and `live` need every DARAJA_* setting; `live` only with Safaricom's production
 *       host, `sandbox` never with it. A bad setting answers 503 the same way.
 *     Nothing is read or written before this check passes, so no attempt can exist.
 *  1. Validate request body (payment_id, phone).
 *  2. Confirm ownership + state via RLS (payment pending, booking completed).
 *  3. AMOUNT GUARD (P3). The amount due must be whole shillings from 1 to 250,000. Otherwise
 *     422 `amount_not_payable`, before any attempt exists. It is never rounded.
 *  4. OAUTH BEFORE THE RESERVATION (P5). A credential failure answers 503 and creates nothing.
 *  5. RESERVE the attempt via reserve_mpesa_attempt: the RPC locks the payment row,
 *     derives the amount from the CURRENT external due, enforces the one-blocking-attempt
 *     invariant, and creates the row as 'initiated'.
 *  6. Re-check the RESERVED amount (P3). If it is not payable, release the attempt with
 *     mark_attempt_failed — Daraja was not contacted, so no money can move — and answer 422.
 *  7. Only then call Daraja (or the mock, which never runs on Production).
 *  8. Definitive acceptance  -> mark_attempt_accepted  (initiated -> pending)
 *     Definitive rejection   -> mark_attempt_failed    (initiated -> failed, retry allowed)
 *     Transport ambiguity    -> leave it 'initiated'   (NEVER mark failed)
 *  9. Return { ok: true, checkoutRequestId, status: 'pending' }.
 *
 * Error answers are `{ ok: false, code, error }`. `code` is STABLE and the app reads it to choose
 * its text (P7); `error` is a human sentence for logs and older app builds:
 *   payments_unavailable (503)  disabled, mock on Production, a bad setting, an OAuth failure
 *   invalid_request      (400)  bad body, payment id or phone
 *   not_payable          (400)  the payment is not pending (or not yours)
 *   job_not_completed    (400)  the booking is not completed yet
 *   amount_not_payable   (422)  not whole shillings, below KES 1 or above KES 250,000
 *   payment_in_progress  (409)  another request for this payment is still open
 *   could_not_start      (400)  the reservation failed for another reason
 *   request_rejected     (400)  Daraja definitively refused the request; a retry is allowed
 *   status_unknown       (502)  the request may have reached Daraja; do NOT retry
 *   not_recorded         (500)  Daraja accepted but the acceptance could not be saved
 *   unexpected_error     (500)  anything else
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
 * Nothing in this function logs a setting value, the phone number or a token.
 */

import { createClient } from 'jsr:@supabase/supabase-js@2';
import {
  STK_ACCOUNT_REFERENCE_MAX_LENGTH,
  STK_TRANSACTION_DESC,
  buildStkPassword,
  buildStkPushPayload,
  checkDarajaSettings,
  checkMpesaAmount,
  darajaTimestamp,
  effectiveMpesaMode,
  externalAmountDue,
  isMockMode,
  isMsisdn,
  mockStkResult,
  resolveMpesaMode,
  type DarajaSettings,
} from '../_shared/daraja.ts';
import { getOAuthToken, stkPush, type StkPushResult } from '../_shared/daraja-client.ts';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Send a JSON response with the given HTTP status code. */
function json(obj: unknown, status = 200): Response {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/** The stable error codes listed in the header. The app maps each one to its own text. */
type StkErrorCode =
  | 'payments_unavailable'
  | 'invalid_request'
  | 'not_payable'
  | 'job_not_completed'
  | 'amount_not_payable'
  | 'payment_in_progress'
  | 'could_not_start'
  | 'request_rejected'
  | 'status_unknown'
  | 'not_recorded'
  | 'unexpected_error';

/** Send an error answer: `{ ok: false, code, error }`. */
function fail(code: StkErrorCode, error: string, status: number): Response {
  return json({ ok: false, code, error }, status);
}

/** The customer-facing sentence for every `payments_unavailable` answer. */
const PAYMENTS_UNAVAILABLE =
  'M-PESA payments are temporarily unavailable. Your booking is safe; please try again later.';

// ─── Handler ──────────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  try {
    // 0. Mode first (P1, S40-10). Nothing below runs, and no attempt can be created, unless
    //    payments are switched on AND correctly configured.
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const modeSetting = Deno.env.get('MPESA_MODE');
    const mode = effectiveMpesaMode(modeSetting, supabaseUrl);

    if (mode === 'disabled') {
      if (resolveMpesaMode(modeSetting) === 'mock') {
        console.warn('mpesa-stk-push: MPESA_MODE=mock is refused on Production; payments are disabled.');
      }
      return fail('payments_unavailable', PAYMENTS_UNAVAILABLE, 503);
    }

    // sandbox / live: every Daraja setting must be present and point at the right host. The mock
    // needs none, so `settings` stays null in mock mode.
    let settings: DarajaSettings | null = null;
    if (!isMockMode(mode)) {
      const check = checkDarajaSettings(mode === 'live' ? 'live' : 'sandbox', (name) => Deno.env.get(name));
      if (!check.ok) {
        // `problem` names settings only, never their values.
        console.error(`mpesa-stk-push: payments unavailable (${check.problem}).`);
        return fail('payments_unavailable', PAYMENTS_UNAVAILABLE, 503);
      }
      settings = check.settings;
    }

    // 1. Parse and validate input.
    const authHeader = req.headers.get('Authorization') ?? '';
    let body: { payment_id?: unknown; phone?: unknown };
    try {
      body = await req.json();
    } catch {
      return fail('invalid_request', 'Invalid request.', 400);
    }

    const { payment_id, phone } = body as { payment_id?: string; phone?: string };

    if (!payment_id || !isMsisdn(phone ?? '')) {
      return fail('invalid_request', 'Invalid request.', 400);
    }

    // 2. User-scoped client (respects RLS — confirms ownership).
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    // 2a. Check payment: must belong to the user and be in 'pending' state.
    const { data: payment } = await userClient
      .from('payments')
      .select('id, amount, wallet_applied, promo_discount, booking_id, status')
      .eq('id', payment_id)
      .maybeSingle();

    if (!payment || payment.status !== 'pending') {
      return fail('not_payable', 'Payment is not payable.', 400);
    }

    // 2b. Check booking: must be 'completed' (job done before payment).
    const { data: booking } = await userClient
      .from('bookings')
      .select('id, status')
      .eq('id', payment.booking_id)
      .maybeSingle();

    if (!booking || booking.status !== 'completed') {
      return fail('job_not_completed', 'Job is not completed yet.', 400);
    }

    // 3. Amount guard, BEFORE the reservation (P3). This only refuses early so that an amount
    //    M-PESA cannot take never creates an attempt. The amount SENT is still the reserved one.
    const earlyCheck = checkMpesaAmount(externalAmountDue(payment));
    if (!earlyCheck.ok) {
      return fail('amount_not_payable', earlyCheck.message, 422);
    }

    // 4. OAuth token BEFORE the reservation (P5). Getting a token moves no money, so a wrong or
    //    expired credential now ends here with 503 and no attempt, instead of leaving a blocking
    //    attempt behind for every customer. The mock needs no token.
    let token = '';
    if (settings !== null) {
      try {
        token = await getOAuthToken();
      } catch {
        console.error('mpesa-stk-push: Daraja OAuth failed; payments unavailable.');
        return fail('payments_unavailable', PAYMENTS_UNAVAILABLE, 503);
      }
    }

    // 5. RESERVE the attempt BEFORE contacting Daraja.
    // The RPC locks the payment row, recomputes external_due under that lock, enforces the
    // one-blocking-attempt invariant and rejects a zero-due payment. The amount is decided
    // server-side; this function never computes the amount it sends.
    const admin = createClient(supabaseUrl, serviceRoleKey);

    const { data: reservation, error: reserveError } = await admin
      .rpc('reserve_mpesa_attempt', { p_payment_id: payment_id, p_phone: phone })
      .maybeSingle();

    if (reserveError || !reservation) {
      // Reservation failed — Daraja has NOT been contacted and no attempt exists. The 0045 RPC
      // raises 'Payment has an open external attempt' when another request is still open.
      if (reserveError?.message?.includes('open external attempt')) {
        return fail('payment_in_progress', 'A payment request is already in progress.', 409);
      }
      return fail('could_not_start', 'Could not start payment.', 400);
    }

    const attemptId = (reservation as { attempt_id: string }).attempt_id;
    const amountDue = Number((reservation as { amount: number | string }).amount);

    // 6. Re-check the RESERVED amount (P3). Daraja has not been contacted, so releasing the
    //    attempt as failed is safe: no prompt exists and no money can move.
    const reservedCheck = checkMpesaAmount(amountDue);
    if (!reservedCheck.ok) {
      const { error: releaseError } = await admin.rpc('mark_attempt_failed', {
        p_attempt_id: attemptId,
        p_reason: `${reservedCheck.message} M-PESA was not contacted.`,
        p_raw: null,
      });
      if (releaseError) {
        // The attempt stays 'initiated'; the cron ages it to 'timed_out' for an admin to review.
        console.error('mpesa-stk-push: could not release a refused attempt; it will need review.');
      }
      return fail('amount_not_payable', reservedCheck.message, 422);
    }

    // 7. Initiate STK Push (mock or real). From here an attempt row EXISTS, so every exit path
    //    must resolve it deliberately: accepted, definitively failed, or left 'initiated'.
    let merchantRequestId: string;
    let checkoutRequestId: string;
    let raw: Record<string, unknown>;

    if (settings === null) {
      // Mock mode (never on Production) — no Daraja secrets required.
      const m = mockStkResult({ phone: phone!, amount: amountDue });
      merchantRequestId = m.merchantRequestId;
      checkoutRequestId = m.checkoutRequestId;
      raw = m.raw;
    } else {
      // Sandbox / live mode — hit the real Daraja API. The payload is built before the request
      // is sent, so a builder error can never be mistaken for transport ambiguity.
      const ts = darajaTimestamp(new Date());
      const password = buildStkPassword(settings.shortcode, settings.passkey, ts);
      const payload = buildStkPushPayload({
        shortcode: settings.shortcode,
        password,
        timestamp: ts,
        amount: amountDue,
        phone: phone!,
        callbackUrl: settings.callbackUrl,
        accountReference: String(payment.booking_id).slice(0, STK_ACCOUNT_REFERENCE_MAX_LENGTH),
        transactionDesc: STK_TRANSACTION_DESC,
        transactionType: settings.transactionType,
        partyB: settings.partyB,
      });

      let result: StkPushResult;
      try {
        result = await stkPush(token, payload);
      } catch {
        // TRANSPORT AMBIGUITY — the request may or may not have reached Daraja. Do NOT mark the
        // attempt failed: that would release the funding freeze and permit a retry while the
        // customer could still be charged. Leave it 'initiated' for the cron to age to
        // 'timed_out', which stays blocking until a callback or an evidenced reconciliation.
        return fail('status_unknown', 'Payment status unknown. Please check before retrying.', 502);
      }

      // TRANSPORT-LEVEL FAILURE (5xx, 429, 408, any non-2xx). The request left this function and
      // Daraja may still have queued the prompt, so the outcome is NOT proven. A JSON error body
      // on a non-2xx response is evidence, never a rejection. Never mark failed here.
      if (!result.ok) {
        return fail('status_unknown', 'Payment status unknown. Please check before retrying.', 502);
      }

      const resp = result.body;

      // 2xx with an unparseable or absent body proves nothing either way.
      if (!resp) {
        return fail('status_unknown', 'Payment status unknown. Please check before retrying.', 502);
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
        return fail(
          'request_rejected',
          (resp.ResponseDescription as string) ?? 'STK push failed.',
          400,
        );
      }

      if (responseCode === null) {
        // 2xx but no usable ResponseCode: Daraja did not tell us what it did. AMBIGUOUS.
        return fail('status_unknown', 'Payment status unknown. Please check before retrying.', 502);
      }

      merchantRequestId = resp.MerchantRequestID as string;
      checkoutRequestId = resp.CheckoutRequestID as string;
      raw = resp;

      if (!merchantRequestId || !checkoutRequestId) {
        // Accepted per ResponseCode but no usable identifiers: we cannot correlate a future
        // callback. Treat as AMBIGUOUS, never as failure, and never invent an identifier.
        return fail('status_unknown', 'Payment status unknown. Please check before retrying.', 502);
      }
    }

    // 8. DEFINITIVE acceptance — move initiated -> pending and persist provider identifiers.
    const { error: acceptError } = await admin.rpc('mark_attempt_accepted', {
      p_attempt_id: attemptId,
      p_merchant_request_id: merchantRequestId,
      p_checkout_request_id: checkoutRequestId,
      p_raw: raw,
    });

    if (acceptError) {
      // Daraja accepted but we failed to record it. Do NOT retry Daraja and do NOT create a
      // second attempt — the 'initiated' row stands as reconciliation evidence.
      return fail('not_recorded', 'Payment started but could not be recorded.', 500);
    }

    // 9. Success — the app refreshes every few seconds and also gets the payment push (P7).
    return json({ ok: true, checkoutRequestId, status: 'pending' });
  } catch {
    return fail('unexpected_error', 'Unexpected error.', 500);
  }
});
