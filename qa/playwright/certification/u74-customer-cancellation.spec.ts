import { test, expect, type APIRequestContext } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { certificationConfigured, certificationSkipReason } from '../support/connected/qa-accounts';
import { authedContextWithUser } from '../support/connected/qa-client';
import {
  createCustomerBooking,
  assignProvider,
  setBookingStatus,
  readBookingById,
  readBookingNotifications,
  deleteBookingsByIds,
} from '../support/connected/qa-bookings';
import { makeTrackableBooking, upsertLocation, getLocation } from '../support/connected/qa-location';
import { rpc, setQuote, acceptQuote } from '../support/connected/qa-payments';

/**
 * U74 — the customer cancellation feature (CONNECTED live proof; QA run sheet Line 33, Appendix B.4).
 *
 * The customer cancels through the SECURITY DEFINER RPC customer_cancel_booking(p_booking_id, p_reason_code,
 * p_idempotency_key). It returns 200 with a JSON result ({ ok, outcome | code, … }); refusals that are part of
 * the product (work_started, …) are ok:false results, not HTTP errors. A cancellation writes one
 * booking_cancellations audit row, notifies the provider, clears the live location, and accept_quote then
 * refuses the booking. An admin cancellation sends the customer one "Booking cancelled" notice. Rows written
 * here are test data: every booking is deleted in afterAll (booking_cancellations cascades on booking delete).
 */
const P1 = { name: 'QA Provider One', phone: '+254700000001' };
const LAT = -1.2921;
const LNG = 36.8219;
const FINAL = 'booking_status_final';

type CancelResult = {
  ok?: boolean; outcome?: string; code?: string; from_status?: string; provider_notified?: boolean;
  cancelled_by?: string; same_request?: boolean;
};

test.describe('U74 — customer cancellation', { tag: ['@certification', '@connected', '@u74', '@u74-f'] }, () => {
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
    adminCtx = (await authedContextWithUser('admin')).ctx;
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

  async function freshBooking(): Promise<string> {
    const b = await createCustomerBooking(customerCtx, customerId);
    bookingIds.push(b.id);
    return b.id;
  }
  async function assignedBooking(): Promise<string> {
    const id = await freshBooking();
    await assignProvider(adminCtx, id, { providerId: provider1Id, ...P1 });
    return id;
  }
  /** The customer's RPC call; the HTTP status must be 200 (a JSON result, never an HTTP error). */
  async function cancel(id: string, key: string = randomUUID()): Promise<CancelResult> {
    const r = await rpc(customerCtx, 'customer_cancel_booking', { p_booking_id: id, p_reason_code: 'plans_changed', p_idempotency_key: key });
    expect(r.status, r.text).toBe(200);
    return r.body as CancelResult;
  }
  async function auditRows(ctx: APIRequestContext, id: string): Promise<Record<string, unknown>[]> {
    const res = await ctx.get(`/rest/v1/booking_cancellations?booking_id=eq.${id}&select=booking_id,location_cleared,from_status`);
    expect(res.status(), await res.text()).toBe(200);
    return (await res.json()) as Record<string, unknown>[];
  }

  test('F-L1: the customer cancels an assigned booking (cancelled, from provider_assigned, provider notified)', async () => {
    const id = await assignedBooking();
    const r = await cancel(id);
    expect(r.ok).toBe(true);
    expect(r.outcome).toBe('cancelled');
    expect(r.from_status).toBe('provider_assigned');
    expect(r.provider_notified).toBe(true);
    expect((await readBookingById(adminCtx, id))[0].status, 'admin reads cancelled').toBe('cancelled');
  });

  test('F-L2: the same request again is already_cancelled by you, the same request, with one audit row', async () => {
    const id = await assignedBooking();
    const key = randomUUID();
    expect((await cancel(id, key)).outcome).toBe('cancelled');
    const again = await cancel(id, key);
    expect(again.ok).toBe(true);
    expect(again.outcome).toBe('already_cancelled');
    expect(again.cancelled_by).toBe('you');
    expect(again.same_request).toBe(true);
    expect(await auditRows(adminCtx, id), 'exactly one booking_cancellations row').toHaveLength(1);
  });

  test('F-L3: the provider status PATCH on a customer-cancelled booking is refused with booking_status_final', async () => {
    const id = await assignedBooking();
    expect((await cancel(id)).outcome).toBe('cancelled');
    const p = await setBookingStatus(provider1Ctx, id, 'on_the_way');
    expect(p.status, p.text).toBe(400);
    expect(p.text).toContain(FINAL);
  });

  test('F-L4: the audit row is visible to the customer and the admin, not to another provider; provider1 is notified', async () => {
    const id = await assignedBooking();
    expect((await cancel(id)).outcome).toBe('cancelled');
    expect(await auditRows(customerCtx, id), 'customer reads 1').toHaveLength(1);
    expect(await auditRows(adminCtx, id), 'admin reads 1').toHaveLength(1);
    expect(await auditRows(provider2Ctx, id), 'provider2 reads 0').toHaveLength(0);
    const notices = (await readBookingNotifications(provider1Ctx, id)).filter((n) => n.type === 'booking_cancelled');
    expect(notices, 'provider1 has one booking_cancelled notice').toHaveLength(1);
  });

  test('F-L5: cancelling an on_the_way booking clears the live location (admin 0 rows; location_cleared true)', async () => {
    const id = await makeTrackableBooking({ customerCtx, customerId, providerCtx: provider1Ctx, adminCtx, provider: { providerId: provider1Id, ...P1 } });
    bookingIds.push(id);
    expect((await upsertLocation(provider1Ctx, id, LAT, LNG)).status).toBeLessThan(300);
    const r = await cancel(id);
    expect(r.outcome).toBe('cancelled');
    expect(r.from_status).toBe('on_the_way');
    expect(await getLocation(adminCtx, id), 'admin reads 0 location rows').toHaveLength(0);
    const [row] = await auditRows(adminCtx, id);
    expect(row?.location_cleared, 'the audit row records the clearing').toBe(true);
  });

  test('F-L6: once work has started the customer cannot cancel (work_started; status unchanged)', async () => {
    const id = await assignedBooking();
    expect((await setBookingStatus(provider1Ctx, id, 'on_the_way')).changed).toBe(true);
    expect((await setBookingStatus(provider1Ctx, id, 'in_progress')).changed).toBe(true);
    const r = await cancel(id);
    expect(r.ok).toBe(false);
    expect(r.code).toBe('work_started');
    expect((await readBookingById(adminCtx, id))[0].status, 'still in_progress').toBe('in_progress');
  });

  test('F-L7: an admin cancellation sends the customer exactly one "Booking cancelled" notice', async () => {
    const id = await freshBooking();
    expect((await setBookingStatus(adminCtx, id, 'cancelled')).row?.status).toBe('cancelled');
    const notices = (await readBookingNotifications(customerCtx, id)).filter((n) => n.title === 'Booking cancelled');
    expect(notices, 'exactly one notice').toHaveLength(1);
    expect(notices[0].type).toBe('booking_cancelled');
  });

  test('F-L8: after the customer cancels, accept_quote is refused and no payment row exists', async () => {
    const id = await assignedBooking();
    const q = await setQuote(adminCtx, id, 1500, 1000);
    expect(q.status, q.text).toBeLessThan(300);
    expect((await cancel(id)).outcome).toBe('cancelled');
    const a = await acceptQuote(customerCtx, id);
    expect(a.status, a.text).toBe(400);
    expect(String((a.body as { message?: string })?.message ?? '')).toContain('Quote cannot be accepted');
    const pay = await adminCtx.get(`/rest/v1/payments?booking_id=eq.${id}&select=id`);
    expect(pay.status()).toBe(200);
    expect(await pay.json(), 'no payment row').toEqual([]);
  });
});
