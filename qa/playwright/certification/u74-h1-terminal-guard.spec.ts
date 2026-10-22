import { test, expect, type APIRequestContext } from '@playwright/test';
import { certificationConfigured, certificationSkipReason } from '../support/connected/qa-accounts';
import { authedContextWithUser } from '../support/connected/qa-client';
import {
  createCustomerBooking,
  assignProvider,
  setBookingStatus,
  readBookingById,
  deleteBookingsByIds,
} from '../support/connected/qa-bookings';

/**
 * U74-H1 — the terminal-status guard (CONNECTED live proof; QA run sheet Line 15, Appendix B.1).
 *
 * H1 adds a BEFORE UPDATE OF status row trigger on bookings: a signed-in non-admin may never move a booking
 * out of 'cancelled' or 'completed'. It raises 'booking_status_final' (errcode P0001), which PostgREST returns
 * as HTTP 400 with that text in the body. Admins keep their transitions. Without H1 the same PATCH is refused
 * by the 0049 policy instead, never with 'booking_status_final'. H1-L1 holds before and after U74, so it is
 * also tagged @u74-pre (the pre-push plumbing line). Every booking is deleted in afterAll.
 * Expected statuses and bodies are justified in 83b specs/SPEC-JUSTIFICATION.md.
 */
const P1 = { name: 'QA Provider One', phone: '+254700000001' };
const FINAL = 'booking_status_final';

test.describe('U74-H1 — terminal-status guard', { tag: ['@certification', '@connected', '@u74', '@u74-h1'] }, () => {
  let customerCtx: APIRequestContext;
  let customerId: string;
  let provider1Ctx: APIRequestContext;
  let provider1Id: string;
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
    adminCtx = (await authedContextWithUser('admin')).ctx;
  });

  test.afterAll(async () => {
    if (bookingIds.length) await deleteBookingsByIds(bookingIds);
    await customerCtx?.dispose();
    await provider1Ctx?.dispose();
    await adminCtx?.dispose();
  });

  test.beforeEach(({}, testInfo) => {
    test.skip(!certificationConfigured(), certificationSkipReason());
    test.skip(testInfo.project.name !== 'chromium', 'Connected coverage is Chromium-only.');
  });

  /** A fresh booking assigned to provider1 (status provider_assigned); tracked for cleanup. */
  async function assignedBooking(): Promise<string> {
    const b = await createCustomerBooking(customerCtx, customerId);
    bookingIds.push(b.id);
    await assignProvider(adminCtx, b.id, { providerId: provider1Id, ...P1 });
    return b.id;
  }

  test('H1-L1 positive control: the assigned provider still moves provider_assigned → on_the_way', { tag: ['@u74-pre'] }, async () => {
    const id = await assignedBooking();
    const r = await setBookingStatus(provider1Ctx, id, 'on_the_way');
    expect(r.changed, `HTTP ${r.status} ${r.text}`).toBe(true);
    expect(r.row?.status).toBe('on_the_way');
  });

  test('H1-L2 (I-105-1): after the admin cancels, the provider status PATCH is refused with booking_status_final', async () => {
    const id = await assignedBooking();
    expect((await setBookingStatus(adminCtx, id, 'cancelled')).row?.status, 'admin cancels').toBe('cancelled');
    const r = await setBookingStatus(provider1Ctx, id, 'in_progress');
    expect(r.status, r.text).toBe(400);
    expect(r.text, 'refused by the H1 guard, not by a policy').toContain(FINAL);
    expect(r.changed).toBe(false);
    expect((await readBookingById(adminCtx, id))[0].status, 'the cancellation stands').toBe('cancelled');
  });

  test('H1-L3: the provider cannot reopen a completed booking (booking_status_final)', async () => {
    const id = await assignedBooking();
    expect((await setBookingStatus(provider1Ctx, id, 'on_the_way')).changed).toBe(true);
    expect((await setBookingStatus(provider1Ctx, id, 'in_progress')).changed).toBe(true);
    expect((await setBookingStatus(provider1Ctx, id, 'completed')).changed, 'provider completes').toBe(true);
    const r = await setBookingStatus(provider1Ctx, id, 'in_progress');
    expect(r.status, r.text).toBe(400);
    expect(r.text).toContain(FINAL);
    expect((await readBookingById(adminCtx, id))[0].status, 'still completed').toBe('completed');
  });

  test('H1-L4: an admin keeps the power to move a cancelled booking back to pending', async () => {
    const id = await assignedBooking();
    expect((await setBookingStatus(adminCtx, id, 'cancelled')).row?.status).toBe('cancelled');
    const r = await setBookingStatus(adminCtx, id, 'pending');
    expect(r.changed, `HTTP ${r.status} ${r.text}`).toBe(true);
    expect(r.row?.status).toBe('pending');
  });
});
