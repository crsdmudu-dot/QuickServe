import { type APIRequestContext, request } from '@playwright/test';
import { qaSupabaseUrl, qaSupabaseAnonKey, assertNotProduction } from './qa-accounts';
import { createCustomerBooking, assignProvider, setBookingStatus, type ProviderInfo } from './qa-bookings';

/**
 * qa-payments.ts — connected payment DB-state primitives (Phase 2B).
 *
 * Drives the REAL payment lifecycle of the dedicated QA project entirely through
 * the implemented SECURITY DEFINER RPCs (set_quote / accept_quote /
 * initiate_payment_attempt / confirm_payment_attempt / cancel_payment_attempt /
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

export const confirmAttempt = (adminCtx: APIRequestContext, attemptId: string) =>
  rpc(adminCtx, 'confirm_payment_attempt', { p_attempt_id: attemptId });

export const cancelAttempt = (adminCtx: APIRequestContext, attemptId: string) =>
  rpc(adminCtx, 'cancel_payment_attempt', { p_attempt_id: attemptId });

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
): Promise<RpcResult> {
  const svc = await serviceContext();
  try {
    return await rpc(svc, 'apply_mpesa_callback', {
      p_checkout_request_id: checkoutRequestId,
      p_merchant_request_id: `mr-${checkoutRequestId}`,
      p_result_code: resultCode,
      p_result_desc: resultDesc,
      p_raw: { stub: true },
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
