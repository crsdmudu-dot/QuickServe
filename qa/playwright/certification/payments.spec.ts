import { test, expect, type APIRequestContext } from '@playwright/test';
import { certificationConfigured, certificationSkipReason } from '../support/connected/qa-accounts';
import { anonContext, authedContextWithUser } from '../support/connected/qa-client';
import { createCustomerBooking, assignProvider, setBookingStatus, deleteBookingsByIds } from '../support/connected/qa-bookings';
import {
  makePayableBooking,
  setQuote,
  acceptQuote,
  initiateAttempt,
  confirmAttempt,
  cancelAttempt,
  overrideStatus,
  getPaymentByBooking,
  getAttempts,
  getEarningByBooking,
  createAttemptWithCheckoutId,
  applyMpesaCallback,
} from '../support/connected/qa-payments';

/**
 * Phase 2B — Payments DB-state integrity (CONNECTED, mock mode).
 *
 * Exercises the REAL payment lifecycle of the dedicated QA project through the
 * implemented SECURITY DEFINER RPCs + RLS — NO real money, NO Daraja/M-Pesa, NO
 * edge function, NO secret. User-path tests use role tokens; admin/setup/callback
 * paths are clearly labelled. Every created booking (and its cascading payment /
 * attempts / earning) is deleted in afterAll. Chromium-only; gated on
 * certificationConfigured() (never targets production).
 *
 * NOTE: real M-Pesa sandbox initiation (mpesa-stk-push edge) and the secret-gated
 * mpesa-callback edge are NOT exercised here (no QA callback secret); the callback's
 * DB idempotency is validated through its service-role RPC `apply_mpesa_callback`.
 */
const PROVIDER1 = { name: 'QA Provider One', phone: '+254700000001' };

test.describe('Phase 2B — Payments DB-state', { tag: ['@certification', '@connected'] }, () => {
  let customerCtx: APIRequestContext;
  let customerId: string;
  let provider1Ctx: APIRequestContext;
  let provider1Id: string;
  let provider2Ctx: APIRequestContext;
  let adminCtx: APIRequestContext;
  const bookingIds: string[] = [];

  test.beforeAll(async ({}, testInfo) => {
    if (!certificationConfigured() || testInfo.project.name !== 'chromium') return;
    const c = await authedContextWithUser('customer');
    customerCtx = c.ctx;
    customerId = c.userId;
    const p1 = await authedContextWithUser('provider1');
    provider1Ctx = p1.ctx;
    provider1Id = p1.userId;
    provider2Ctx = (await authedContextWithUser('provider2')).ctx;
    adminCtx = await authedContextWithUser('admin').then((a) => a.ctx);
  });

  test.afterAll(async () => {
    if (bookingIds.length) await deleteBookingsByIds(bookingIds);
    await customerCtx?.dispose();
    await provider1Ctx?.dispose();
    await provider2Ctx?.dispose();
    await adminCtx?.dispose();
  });

  test.beforeEach(({}, testInfo) => {
    test.skip(!certificationConfigured(), certificationSkipReason());
    test.skip(testInfo.project.name !== 'chromium', 'Connected coverage is Chromium-only.');
  });

  /** Fresh completed+assigned booking with a pending payment; tracked for cleanup. */
  async function payable(amount = 1000, providerShare = 800) {
    const r = await makePayableBooking({
      customerCtx,
      customerId,
      provider1Ctx,
      adminCtx,
      provider: { providerId: provider1Id, ...PROVIDER1 },
      amount,
      providerShare,
    });
    bookingIds.push(r.bookingId);
    return r;
  }

  /** A booking progressed to completed with a quote 'sent' but NOT yet accepted. */
  async function quotedNotAccepted() {
    const booking = await createCustomerBooking(customerCtx, customerId);
    bookingIds.push(booking.id);
    await assignProvider(adminCtx, booking.id, { providerId: provider1Id, ...PROVIDER1 });
    for (const s of ['on_the_way', 'in_progress', 'completed']) await setBookingStatus(provider1Ctx, booking.id, s);
    await setQuote(adminCtx, booking.id, 1000, 800);
    return booking.id;
  }

  // ── Creation, amount & referential integrity ──────────────────────────────

  test('creation: accepting a quote creates one pending payment with correct relationship and shares', { tag: ['@p1'] }, async () => {
    const { bookingId } = await payable(1000, 800);
    const [p] = await getPaymentByBooking(adminCtx, bookingId);
    expect(p.booking_id).toBe(bookingId);
    expect(p.customer_id).toBe(customerId);
    expect(Number(p.amount)).toBe(1000);
    expect(p.currency).toBe('KES');
    expect(p.status).toBe('pending');
    expect(Number(p.provider_share) + Number(p.quickserve_share)).toBe(Number(p.amount)); // shares constraint
    expect(Number(p.provider_share)).toBe(800);
  });

  test('amount integrity: set_quote rejects negative amount and out-of-range provider_share', { tag: ['@p1', '@security'] }, async () => {
    const bookingId = await quotedNotAccepted();
    expect((await setQuote(adminCtx, bookingId, -1, 0)).status, 'negative amount').toBe(400);
    expect((await setQuote(adminCtx, bookingId, 1000, 1500)).status, 'share > amount').toBe(400);
  });

  test('authorization: only an admin can set a quote', { tag: ['@p1', '@security'] }, async () => {
    const booking = await createCustomerBooking(customerCtx, customerId);
    bookingIds.push(booking.id);
    expect((await setQuote(customerCtx, booking.id, 1000, 800)).status, 'customer set_quote denied').toBe(400);
    expect((await setQuote(provider1Ctx, booking.id, 1000, 800)).status, 'provider set_quote denied').toBe(400);
  });

  // ── Duplicate / idempotent quote acceptance ───────────────────────────────

  test('idempotency: a quote accepts once (customer-only) and yields exactly one payment', { tag: ['@p1', '@integrity'] }, async () => {
    const bookingId = await quotedNotAccepted();
    // Not the customer → denied.
    expect((await acceptQuote(provider2Ctx, bookingId)).status, 'non-owner accept denied').toBe(400);
    // Customer accepts → payment created.
    expect((await acceptQuote(customerCtx, bookingId)).status, 'owner accept ok').toBeLessThan(300);
    // Re-accepting is rejected (no longer 'sent') and creates no second payment.
    expect((await acceptQuote(customerCtx, bookingId)).status, 're-accept rejected').toBe(400);
    expect(await getPaymentByBooking(adminCtx, bookingId)).toHaveLength(1);
  });

  // ── Initiation ────────────────────────────────────────────────────────────

  test('initiation: a customer initiates an attempt with the server-controlled amount', { tag: ['@p1'] }, async () => {
    const { bookingId, paymentId, amount } = await payable();
    const r = await initiateAttempt(customerCtx, paymentId);
    expect(r.status, 'initiate ok').toBe(200);
    const attempts = await getAttempts(adminCtx, paymentId);
    expect(attempts).toHaveLength(1);
    expect(attempts[0].status).toBe('pending');
    expect(Number(attempts[0].amount), 'amount is server-derived, not client-set').toBe(amount);
    void bookingId;
  });

  test('authorization: a different user cannot initiate a payment attempt', { tag: ['@p1', '@security'] }, async () => {
    const { paymentId } = await payable();
    const r = await initiateAttempt(provider2Ctx, paymentId);
    expect(r.status, 'cross-user initiate denied').toBe(400);
    expect(String((r.body as { message?: string })?.message ?? '')).toContain('Permission denied');
  });

  test('referential integrity: initiating against an unknown payment is rejected', { tag: ['@p1', '@security'] }, async () => {
    const r = await initiateAttempt(customerCtx, '00000000-0000-0000-0000-000000000000');
    expect(r.status).toBe(400);
    expect(String((r.body as { message?: string })?.message ?? '')).toContain('Payment not found');
  });

  test('state guard: an attempt cannot be initiated once the payment is no longer pending', { tag: ['@p1', '@integrity'] }, async () => {
    const { paymentId } = await payable();
    expect((await overrideStatus(adminCtx, paymentId, 'paid')).status, 'admin marks paid').toBeLessThan(300);
    const r = await initiateAttempt(customerCtx, paymentId);
    expect(r.status).toBe(400);
    expect(String((r.body as { message?: string })?.message ?? '')).toContain('not in pending status');
  });

  // ── Success / failure transitions ─────────────────────────────────────────

  test('success: admin confirmation marks the payment paid and creates the provider earning', { tag: ['@p1'] }, async () => {
    const { bookingId, paymentId, providerShare } = await payable();
    await initiateAttempt(customerCtx, paymentId);
    const [attempt] = await getAttempts(adminCtx, paymentId);
    expect((await confirmAttempt(adminCtx, attempt.id as string)).status, 'confirm ok').toBeLessThan(300);
    const [p] = await getPaymentByBooking(adminCtx, bookingId);
    expect(p.status).toBe('paid');
    expect(p.paid_at).toBeTruthy();
    expect(p.payment_method).toBe('mpesa');
    const earnings = await getEarningByBooking(adminCtx, bookingId);
    expect(earnings).toHaveLength(1);
    expect(Number(earnings[0].amount)).toBe(providerShare);
    expect(earnings[0].payout_status).toBe('pending');
  });

  test('authorization: only an admin can confirm an attempt (success cannot be self-applied)', { tag: ['@p1', '@security'] }, async () => {
    const { paymentId } = await payable();
    await initiateAttempt(customerCtx, paymentId);
    const [attempt] = await getAttempts(adminCtx, paymentId);
    const r = await confirmAttempt(customerCtx, attempt.id as string);
    expect(r.status, 'customer confirm denied').toBe(400);
    expect(String((r.body as { message?: string })?.message ?? '')).toContain('Permission denied');
  });

  test('idempotency: re-confirming a successful attempt is rejected and creates no duplicate earning', { tag: ['@p1', '@integrity'] }, async () => {
    const { bookingId, paymentId } = await payable();
    await initiateAttempt(customerCtx, paymentId);
    const [attempt] = await getAttempts(adminCtx, paymentId);
    expect((await confirmAttempt(adminCtx, attempt.id as string)).status).toBeLessThan(300);
    // Second confirm: attempt is now 'successful' (terminal) → not confirmable.
    expect((await confirmAttempt(adminCtx, attempt.id as string)).status, 're-confirm rejected').toBe(400);
    expect((await getPaymentByBooking(adminCtx, bookingId))[0].status, 'still paid').toBe('paid');
    expect(await getEarningByBooking(adminCtx, bookingId), 'exactly one earning').toHaveLength(1);
  });

  test('failure: cancelling an attempt is terminal and leaves the payment pending', { tag: ['@p1', '@integrity'] }, async () => {
    const { bookingId, paymentId } = await payable();
    await initiateAttempt(customerCtx, paymentId);
    const [attempt] = await getAttempts(adminCtx, paymentId);
    expect((await cancelAttempt(adminCtx, attempt.id as string)).status, 'cancel ok').toBeLessThan(300);
    expect((await getAttempts(adminCtx, paymentId))[0].status).toBe('cancelled');
    expect((await getPaymentByBooking(adminCtx, bookingId))[0].status, 'payment NOT falsely paid').toBe('pending');
    // Cancelling again hits the terminal-state guard.
    expect((await cancelAttempt(adminCtx, attempt.id as string)).status, 're-cancel rejected').toBe(400);
  });

  test('invalid transition: override_payment_status rejects an unsupported status value', { tag: ['@p1', '@security'] }, async () => {
    const { paymentId } = await payable();
    const r = await overrideStatus(adminCtx, paymentId, 'not-a-status');
    expect(r.status).toBe(400);
    expect(String((r.body as { message?: string })?.message ?? '')).toContain('Invalid status value');
  });

  test('authorization: only an admin can override payment status', { tag: ['@p1', '@security'] }, async () => {
    const { paymentId } = await payable();
    expect((await overrideStatus(customerCtx, paymentId, 'cancelled')).status, 'customer override denied').toBe(400);
  });

  // ── RLS authorization ─────────────────────────────────────────────────────

  test('RLS: payments and earnings are visible only to the permitted tenant', { tag: ['@p1', '@security'] }, async () => {
    const { bookingId, paymentId } = await payable();
    await initiateAttempt(customerCtx, paymentId);
    const [attempt] = await getAttempts(adminCtx, paymentId);
    await confirmAttempt(adminCtx, attempt.id as string); // creates the earning

    // payments_select: customer own + admin only.
    expect(await getPaymentByBooking(customerCtx, bookingId), 'customer sees own payment').toHaveLength(1);
    expect(await getPaymentByBooking(adminCtx, bookingId), 'admin sees payment').toHaveLength(1);
    expect(await getPaymentByBooking(provider2Ctx, bookingId), 'other provider sees none').toHaveLength(0);
    const anon = await anonContext();
    try {
      const res = await anon.get(`/rest/v1/payments?booking_id=eq.${bookingId}&select=id`);
      expect(await res.json()).toEqual([]);
    } finally {
      await anon.dispose();
    }

    // provider_earnings_select: assigned provider own + admin only.
    expect(await getEarningByBooking(provider1Ctx, bookingId), 'assigned provider sees own earning').toHaveLength(1);
    expect(await getEarningByBooking(provider2Ctx, bookingId), 'other provider sees none').toHaveLength(0);
    expect(await getEarningByBooking(customerCtx, bookingId), 'customer sees no earning').toHaveLength(0);
  });

  // ── Callback DB path (service-role RPC; NOT the secret-gated edge) ─────────

  test('callback idempotency: apply_mpesa_callback settles once and is a no-op on replay', { tag: ['@p1', '@integrity'] }, async () => {
    const { bookingId, paymentId } = await payable();
    const checkoutId = `qa-p2b-${crypto.randomUUID()}`;
    await createAttemptWithCheckoutId(paymentId, 1000, checkoutId);

    // Success callback → payment paid, attempt successful, one earning.
    expect((await applyMpesaCallback(checkoutId, 0)).status).toBeLessThan(300);
    expect((await getPaymentByBooking(adminCtx, bookingId))[0].status).toBe('paid');
    expect(await getEarningByBooking(adminCtx, bookingId)).toHaveLength(1);

    // Replay of the same callback is idempotent — no second earning, still paid.
    expect((await applyMpesaCallback(checkoutId, 0)).status).toBeLessThan(300);
    expect((await getPaymentByBooking(adminCtx, bookingId))[0].status).toBe('paid');
    expect(await getEarningByBooking(adminCtx, bookingId), 'no duplicate earning on replay').toHaveLength(1);
  });

  test('callback failure: a failed callback marks the attempt failed and never marks the payment paid', { tag: ['@p1', '@integrity'] }, async () => {
    const { bookingId, paymentId } = await payable();
    const checkoutId = `qa-p2b-${crypto.randomUUID()}`;
    await createAttemptWithCheckoutId(paymentId, 1000, checkoutId);

    expect((await applyMpesaCallback(checkoutId, 1, 'insufficient funds')).status).toBeLessThan(300);
    const attempts = await getAttempts(adminCtx, paymentId);
    expect(attempts.find((a) => a.status === 'failed'), 'attempt marked failed').toBeTruthy();
    expect((await getPaymentByBooking(adminCtx, bookingId))[0].status, 'payment stays pending').toBe('pending');
    expect(await getEarningByBooking(adminCtx, bookingId), 'no earning on failure').toHaveLength(0);
  });
});
