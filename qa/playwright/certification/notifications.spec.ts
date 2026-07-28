import { test, expect, type APIRequestContext } from '@playwright/test';
import { certificationConfigured, certificationSkipReason } from '../support/connected/qa-accounts';
import { anonContext, authedContextWithUser, authedContext } from '../support/connected/qa-client';
import {
  createCustomerBooking,
  assignProvider,
  setBookingStatus,
  patchBooking,
  readBookingNotifications,
  deleteBookingsByIds,
} from '../support/connected/qa-bookings';

/**
 * Phase 1B — Notification infrastructure (CONNECTED).
 *
 * Exercises the real notification delivery triggers + RLS on the dedicated QA
 * project: creation on booking insert, delivery to the assigned provider on
 * assignment, per-user authorization (RLS), duplicate suppression (dedup_key
 * index + no-op idempotency), the is_read/immutable-column update guard, and
 * failure handling (a rejected status update creates no notification). The created
 * booking is deleted in afterAll (cascading its notifications). Chromium-only;
 * gated on certificationConfigured() (never targets production).
 */
async function customerNotifications(ctx: APIRequestContext, bookingId: string, type: string) {
  const rows = await readBookingNotifications(ctx, bookingId);
  return rows.filter((r) => r.type === type);
}

test.describe('Phase 1B — Notifications', { tag: ['@certification', '@connected'] }, () => {
  let customerCtx: APIRequestContext;
  let customerId: string;
  let provider1Ctx: APIRequestContext;
  let provider1Id: string;
  let provider2Ctx: APIRequestContext;
  let adminCtx: APIRequestContext;
  let bookingId: string;

  test.beforeAll(async ({}, testInfo) => {
    if (!certificationConfigured() || testInfo.project.name !== 'chromium') return;
    const c = await authedContextWithUser('customer');
    customerCtx = c.ctx;
    customerId = c.userId;
    const p1 = await authedContextWithUser('provider1');
    provider1Ctx = p1.ctx;
    provider1Id = p1.userId;
    provider2Ctx = (await authedContextWithUser('provider2')).ctx;
    adminCtx = await authedContext('admin');
    bookingId = (await createCustomerBooking(customerCtx, customerId)).id;
  });

  test.afterAll(async () => {
    if (bookingId) await deleteBookingsByIds([bookingId]);
    await customerCtx?.dispose();
    await provider1Ctx?.dispose();
    await provider2Ctx?.dispose();
    await adminCtx?.dispose();
  });

  test.beforeEach(({}, testInfo) => {
    test.skip(!certificationConfigured(), certificationSkipReason());
    test.skip(testInfo.project.name !== 'chromium', 'Connected coverage is Chromium-only.');
  });

  test('creation: inserting a booking notifies the customer', { tag: ['@p0'] }, async () => {
    const received = await customerNotifications(customerCtx, bookingId, 'booking_received');
    expect(received.length, 'customer got a booking_received notification').toBe(1);
    expect(received[0].user_id).toBe(customerId);
    expect(received[0].title).toBe('Booking received');
  });

  test('delivery: assigning a provider notifies that provider', { tag: ['@p0'] }, async () => {
    await assignProvider(adminCtx, bookingId, {
      providerId: provider1Id,
      name: 'QA Provider One',
      phone: '+254700000001',
    });
    const providerNotifs = await customerNotifications(provider1Ctx, bookingId, 'booking_assigned');
    expect(providerNotifs.length, 'assigned provider got a booking_assigned notification').toBe(1);
    expect(providerNotifs[0].user_id).toBe(provider1Id);
    // And the customer is separately notified of the assignment.
    expect((await customerNotifications(customerCtx, bookingId, 'provider_assigned')).length).toBe(1);
  });

  test('authorization: a different provider and anon cannot read the booking notifications', { tag: ['@p0', '@security'] }, async () => {
    // provider2 is not assigned → RLS (user_id = auth.uid()) yields none of this booking's notifications.
    expect(await readBookingNotifications(provider2Ctx, bookingId)).toEqual([]);
    const anon = await anonContext();
    try {
      const res = await anon.get(`/rest/v1/notifications?booking_id=eq.${bookingId}&select=id`);
      expect(res.status()).toBe(200);
      expect(await res.json()).toEqual([]);
    } finally {
      await anon.dispose();
    }
  });

  test('duplicate suppression: a no-op status update creates no additional notification', { tag: ['@p1', '@integrity'] }, async () => {
    const before = (await customerNotifications(customerCtx, bookingId, 'provider_assigned')).length;
    expect(before, 'exactly one provider_assigned notification exists').toBe(1);
    // Re-setting the SAME status is a no-op: tg_notify_booking_update's WHEN clause
    // (status distinct from old) is false, so no duplicate notification is emitted.
    await setBookingStatus(adminCtx, bookingId, 'provider_assigned');
    const after = (await customerNotifications(customerCtx, bookingId, 'provider_assigned')).length;
    expect(after, 'still exactly one — duplicate suppressed').toBe(1);
  });

  test('authorization: a user may flip is_read but cannot rewrite an immutable field', { tag: ['@p1', '@security'] }, async () => {
    const rows = await readBookingNotifications(customerCtx, bookingId);
    expect(rows.length, 'customer has notifications to update').toBeGreaterThan(0);
    const id = rows[0].id as string;

    // Allowed: flip is_read on own notification.
    const ok = await customerCtx.patch(`/rest/v1/notifications?id=eq.${id}`, {
      headers: { 'Content-Type': 'application/json', Prefer: 'return=representation' },
      data: { is_read: true },
    });
    expect(ok.status(), 'is_read update accepted').toBe(200);
    expect(((await ok.json()) as unknown[]).length, 'row changed').toBe(1);

    // Denied: title is pinned by the notifications_update WITH CHECK.
    const bad = await customerCtx.patch(`/rest/v1/notifications?id=eq.${id}`, {
      headers: { 'Content-Type': 'application/json', Prefer: 'return=representation' },
      data: { title: 'HACKED' },
    });
    expect(bad.status(), 'title rewrite rejected').not.toBe(200);
  });

  test('failure handling: a rejected status update creates no notification', { tag: ['@p1', '@integrity'] }, async () => {
    const before = (await readBookingNotifications(customerCtx, bookingId)).length;
    const r = await setBookingStatus(adminCtx, bookingId, 'not-a-real-status');
    expect(r.changed, 'invalid status must not apply').toBe(false);
    expect(r.status, 'invalid status rejected').toBeGreaterThanOrEqual(400);
    const after = (await readBookingNotifications(customerCtx, bookingId)).length;
    expect(after, 'no notification created by a failed update').toBe(before);
  });
});
