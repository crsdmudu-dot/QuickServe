import { type APIRequestContext, request } from '@playwright/test';
import { qaSupabaseUrl, qaSupabaseAnonKey, assertNotProduction } from './qa-accounts';
import { createCustomerBooking, assignProvider, setBookingStatus, type ProviderInfo } from './qa-bookings';

/**
 * qa-payments.ts — connected payment DB-state primitives (Phase 2B).
 *
 * Drives the REAL payment lifecycle of the dedicated QA project entirely through
 * the implemented SECURITY DEFINER RPCs (set_quote / accept_quote /
 * initiate_payment_attempt / confirm_payment_attempt /
 * reconcile_payment_attempt_no_collection /
 * override_payment_status / mark_payout_paid) and PostgREST reads — the same
 * functions the app calls. NO real money, NO Daraja/M-Pesa, NO edge function, NO
 * secret. The service-role-only `apply_mpesa_callback` (the callback's DB path,
 * revoked from authenticated) is driven via the service role for its idempotency
 * test only. All rows cascade on booking delete, so cleanup reuses booking teardown.
 */

export type RpcResult = { status: number; body: unknown; text: string };

async function readResult(res: { status(): number; text(): Promise<string> }): Promise<RpcResult> {
  const text = await res.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  return { status: res.status(), body, text };
}

/** Call a PostgREST RPC with a role context; never throws (for positive AND negative assertions). */
export async function rpc(
  ctx: APIRequestContext,
  fn: string,
  args: Record<string, unknown>,
): Promise<RpcResult> {
  return readResult(
    await ctx.post(`/rest/v1/rpc/${fn}`, {
      headers: { 'Content-Type': 'application/json' },
      data: args,
    }),
  );
}

// ── Quote → payment ─────────────────────────────────────────────────────────

export const setQuote = (adminCtx: APIRequestContext, bookingId: string, amount: number, providerShare: number) =>
  rpc(adminCtx, 'set_quote', { p_booking_id: bookingId, p_amount: amount, p_provider_share: providerShare });

export const acceptQuote = (customerCtx: APIRequestContext, bookingId: string) =>
  rpc(customerCtx, 'accept_quote', { p_booking_id: bookingId });

export const declineQuote = (customerCtx: APIRequestContext, bookingId: string) =>
  rpc(customerCtx, 'decline_quote', { p_booking_id: bookingId });

// ── Attempt lifecycle ───────────────────────────────────────────────────────

export const initiateAttempt = (
  customerCtx: APIRequestContext,
  paymentId: string,
  provider = 'mpesa',
  phone = '+254700000000',
) =>
  rpc(customerCtx, 'initiate_payment_attempt', {
    p_payment_id: paymentId,
    p_provider: provider,
    p_phone: phone,
    p_external_reference: null,
    p_raw_response: null,
  });

/**
 * Evidenced manual settlement (0045). The old one-argument form was DROPPED, not kept as a
 * compatibility overload, so calling it yields HTTP 404 rather than an authorization error.
 * The collected amount must equal BOTH the attempt amount and the external due exactly —
 * underpayment and overpayment both fail — and mpesa/card attempts require a reference.
 */
export const confirmAttempt = (
  adminCtx: APIRequestContext,
  attemptId: string,
  collectedAmount: number,
  confirmationNote: string,
  confirmationReference: string,
) =>
  rpc(adminCtx, 'confirm_payment_attempt', {
    p_attempt_id: attemptId,
    p_collected_amount: collectedAmount,
    p_confirmation_note: confirmationNote,
    p_confirmation_reference: confirmationReference,
  });

/** Evidence sources accepted by reconcile_payment_attempt_no_collection (0053). */
export type NoCollectionEvidenceSource = 'provider_reference' | 'portal_lookup';

/**
 * Evidenced negative reconciliation (0045, widened to four arguments by 0053). Replaces
 * cancel_payment_attempt, which was dropped: "collection did NOT occur" is a financially
 * material assertion and cannot be evidence-free. Moves a blocking attempt to cancelled and
 * never touches the payment.
 */
export const reconcileAttemptNoCollection = (
  adminCtx: APIRequestContext,
  attemptId: string,
  reconciliationNote: string,
  providerReference: string | null,
  evidenceSource: NoCollectionEvidenceSource,
) =>
  rpc(adminCtx, 'reconcile_payment_attempt_no_collection', {
    p_attempt_id: attemptId,
    p_reconciliation_note: reconciliationNote,
    p_provider_reference: providerReference,
    p_evidence_source: evidenceSource,
  });

export const overrideStatus = (adminCtx: APIRequestContext, paymentId: string, status: string) =>
  rpc(adminCtx, 'override_payment_status', { p_payment_id: paymentId, p_status: status });

export const markPayoutPaid = (adminCtx: APIRequestContext, earningId: string) =>
  rpc(adminCtx, 'mark_payout_paid', { p_earning_id: earningId });

// ── Reads (RLS applies) ─────────────────────────────────────────────────────

export async function getPaymentByBooking(ctx: APIRequestContext, bookingId: string): Promise<Record<string, unknown>[]> {
  const res = await ctx.get(`/rest/v1/payments?booking_id=eq.${bookingId}&select=*`);
  if (res.status() !== 200) throw new Error(`getPaymentByBooking HTTP ${res.status()} — ${await res.text()}`);
  return (await res.json()) as Record<string, unknown>[];
}

export async function getAttempts(ctx: APIRequestContext, paymentId: string): Promise<Record<string, unknown>[]> {
  const res = await ctx.get(`/rest/v1/payment_attempts?payment_id=eq.${paymentId}&select=id,status,amount,provider&order=created_at.asc`);
  if (res.status() !== 200) throw new Error(`getAttempts HTTP ${res.status()} — ${await res.text()}`);
  return (await res.json()) as Record<string, unknown>[];
}

export async function getEarningByBooking(ctx: APIRequestContext, bookingId: string): Promise<Record<string, unknown>[]> {
  const res = await ctx.get(`/rest/v1/provider_earnings?booking_id=eq.${bookingId}&select=id,amount,payout_status,provider_id`);
  if (res.status() !== 200) throw new Error(`getEarningByBooking HTTP ${res.status()} — ${await res.text()}`);
  return (await res.json()) as Record<string, unknown>[];
}

/**
 * The external amount still owed on a payment, as every 0045 settlement path computes it:
 *     external_due = amount - wallet_applied - promo_discount
 * Derived from the payment row so a test never duplicates a hard-coded figure.
 */
export function externalDue(payment: Record<string, unknown>): number {
  return (
    Number(payment.amount) -
    Number(payment.wallet_applied ?? 0) -
    Number(payment.promo_discount ?? 0)
  );
}

/** external_due for the single payment attached to a booking. */
export async function externalDueForBooking(ctx: APIRequestContext, bookingId: string): Promise<number> {
  const [payment] = await getPaymentByBooking(ctx, bookingId);
  if (!payment) throw new Error(`externalDueForBooking: no payment for booking ${bookingId}`);
  return externalDue(payment);
}

/**
 * A success callback payload in the EXACT shape apply_mpesa_callback parses.
 *
 * Verified against the SQL, not assumed: 0045 §10 (body reaffirmed by 0050) reads
 *     p_raw #> '{Body,stkCallback,CallbackMetadata,Item}'
 * — the key is Item, SINGULAR — then selects the array entries named 'Amount' and
 * 'MpesaReceiptNumber' via btrim(i->>'Value'). Both are mandatory: a missing, empty or
 * unparseable Amount, or a missing receipt, records 'missing_or_invalid_callback_evidence'
 * and refuses to settle. The amount must also equal both attempt.amount and external_due.
 *
 * Every value here is synthetic — no real M-Pesa receipt, phone number or personal data.
 */
export function mpesaSuccessRaw(amount: number, receipt: string): Record<string, unknown> {
  return {
    Body: {
      stkCallback: {
        ResultCode: 0,
        ResultDesc: 'The service request is processed successfully.',
        CallbackMetadata: {
          Item: [
            { Name: 'Amount', Value: amount },
            { Name: 'MpesaReceiptNumber', Value: receipt },
            { Name: 'TransactionDate', Value: 20300301090000 },
          ],
        },
      },
    },
  };
}

// ── Service-role helpers (SETUP / callback DB-path only — never for behavior under test) ──

async function serviceContext(): Promise<APIRequestContext> {
  assertNotProduction();
  const key = process.env.QA_SERVICE_ROLE_KEY?.trim();
  if (!key) throw new Error('QA_SERVICE_ROLE_KEY is required for payment callback setup.');
  return request.newContext({
    baseURL: qaSupabaseUrl(),
    extraHTTPHeaders: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
  });
}

/** SETUP: insert an attempt carrying a checkout_request_id (as the mpesa edge would) for the callback test. */
export async function createAttemptWithCheckoutId(
  paymentId: string,
  amount: number,
  checkoutRequestId: string,
): Promise<string> {
  const svc = await serviceContext();
  try {
    const res = await svc.post('/rest/v1/payment_attempts', {
      headers: { Prefer: 'return=representation' },
      data: { payment_id: paymentId, provider: 'mpesa', amount, status: 'pending', checkout_request_id: checkoutRequestId },
    });
    if (res.status() !== 201) throw new Error(`createAttemptWithCheckoutId HTTP ${res.status()} — ${await res.text()}`);
    return ((await res.json()) as { id: string }[])[0].id;
  } finally {
    await svc.dispose();
  }
}

/** The callback's DB path (apply_mpesa_callback is service-role-only by design; the secret-gated edge is NOT used). */
export async function applyMpesaCallback(
  checkoutRequestId: string,
  resultCode: number,
  resultDesc = 'ok',
  raw: Record<string, unknown> = { stub: true },
): Promise<RpcResult> {
  const svc = await serviceContext();
  try {
    return await rpc(svc, 'apply_mpesa_callback', {
      p_checkout_request_id: checkoutRequestId,
      p_merchant_request_id: `mr-${checkoutRequestId}`,
      p_result_code: resultCode,
      p_result_desc: resultDesc,
      p_raw: raw,
    });
  } finally {
    await svc.dispose();
  }
}

// ── Composite setup: a completed, assigned booking with a pending payment ────

/**
 * Create a booking, assign a provider, progress it to completed, set a quote, and
 * accept it — leaving a pending `payments` row. Returns ids for assertions + cleanup.
 * amount=1000, provider_share=800 (quickserve_share=200) by default.
 */
export async function makePayableBooking(opts: {
  customerCtx: APIRequestContext;
  customerId: string;
  provider1Ctx: APIRequestContext;
  adminCtx: APIRequestContext;
  provider: ProviderInfo;
  amount?: number;
  providerShare?: number;
}): Promise<{ bookingId: string; paymentId: string; amount: number; providerShare: number }> {
  const amount = opts.amount ?? 1000;
  const providerShare = opts.providerShare ?? 800;
  const booking = await createCustomerBooking(opts.customerCtx, opts.customerId);
  await assignProvider(opts.adminCtx, booking.id, opts.provider);
  // Assigned provider progresses to completed (forward-only, mirrors provider app).
  for (const s of ['on_the_way', 'in_progress', 'completed']) {
    const r = await setBookingStatus(opts.provider1Ctx, booking.id, s);
    if (!r.changed) throw new Error(`progress to ${s} failed: HTTP ${r.status} — ${r.text}`);
  }
  const q = await setQuote(opts.adminCtx, booking.id, amount, providerShare);
  if (q.status >= 400) throw new Error(`set_quote failed: HTTP ${q.status} — ${q.text}`);
  const a = await acceptQuote(opts.customerCtx, booking.id);
  if (a.status >= 400) throw new Error(`accept_quote failed: HTTP ${a.status} — ${a.text}`);
  const payments = await getPaymentByBooking(opts.adminCtx, booking.id);
  if (payments.length !== 1) throw new Error(`expected 1 payment, got ${payments.length}`);
  return { bookingId: booking.id, paymentId: payments[0].id as string, amount, providerShare };
}
