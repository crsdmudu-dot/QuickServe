import { test, expect, type APIRequestContext } from '@playwright/test';
import { certificationConfigured, certificationSkipReason } from '../support/connected/qa-accounts';
import { authedContextWithUser } from '../support/connected/qa-client';
import { assignProvider, setBookingStatus, deleteBookingsByIds } from '../support/connected/qa-bookings';
import { makeTrackableBooking, upsertLocation, getLocation } from '../support/connected/qa-location';

/**
 * U74-H3 — the location visibility (M-93-4 option (a); CONNECTED live proof; QA run sheet Line 27, Appendix B.3).
 *
 * H3 limits the customer's read of provider_locations to an on_the_way/in_progress booking and the current
 * provider's row, and an AFTER UPDATE OF status, assigned_provider_id trigger DELETES the booking's location
 * when it becomes completed or cancelled or changes provider (so the admin reads 0 rows too: deleted, not
 * hidden). H3-L1 holds before and after U74 (@u74-pre): 0018 let the customer read in any status.
 * Every booking is deleted in afterAll.
 */
const P1 = { name: 'QA Provider One', phone: '+254700000001' };
const P2 = { name: 'QA Provider Two', phone: '+254700000002' };
const LAT = -1.2921;
const LNG = 36.8219;

test.describe('U74-H3 — location visibility', { tag: ['@certification', '@connected', '@u74', '@u74-h3'] }, () => {
  let customerCtx: APIRequestContext;
  let customerId: string;
  let provider1Ctx: APIRequestContext;
  let provider1Id: string;
  let provider2Id: string;
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
    provider2Id = (await authedContextWithUser('provider2')).userId;
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

  /** An on_the_way booking assigned to provider1 with provider1's position written; tracked for cleanup. */
  async function trackedWithPosition(): Promise<string> {
    const id = await makeTrackableBooking({ customerCtx, customerId, providerCtx: provider1Ctx, adminCtx, provider: { providerId: provider1Id, ...P1 } });
    bookingIds.push(id);
    const w = await upsertLocation(provider1Ctx, id, LAT, LNG);
    expect(w.status, w.text).toBeLessThan(300);
    return id;
  }

  test('H3-L1: the customer reads the position while on_the_way and while in_progress', { tag: ['@u74-pre'] }, async () => {
    const id = await trackedWithPosition();
    expect(await getLocation(customerCtx, id), 'on_the_way: customer reads 1').toHaveLength(1);
    expect((await setBookingStatus(provider1Ctx, id, 'in_progress')).changed).toBe(true);
    expect(await getLocation(customerCtx, id), 'in_progress: customer still reads 1').toHaveLength(1);
  });

  test('H3-L2: completing the booking deletes the position (customer 0, admin 0)', async () => {
    const id = await trackedWithPosition();
    expect((await setBookingStatus(provider1Ctx, id, 'in_progress')).changed).toBe(true);
    expect((await setBookingStatus(provider1Ctx, id, 'completed')).changed, 'provider completes').toBe(true);
    expect(await getLocation(customerCtx, id), 'customer reads 0').toHaveLength(0);
    expect(await getLocation(adminCtx, id), 'admin reads 0: deleted, not hidden').toHaveLength(0);
  });

  test('H3-L3: an admin cancellation deletes the position (customer 0, admin 0)', async () => {
    const id = await trackedWithPosition();
    expect((await setBookingStatus(adminCtx, id, 'cancelled')).row?.status).toBe('cancelled');
    expect(await getLocation(customerCtx, id), 'customer reads 0').toHaveLength(0);
    expect(await getLocation(adminCtx, id), 'admin reads 0').toHaveLength(0);
  });

  test('H3-L4: after a reassignment the former provider reads 0, cannot write, and the position is gone', async () => {
    const id = await trackedWithPosition();
    await assignProvider(adminCtx, id, { providerId: provider2Id, ...P2 });
    expect(await getLocation(provider1Ctx, id), 'former provider reads 0').toHaveLength(0);
    const w = await upsertLocation(provider1Ctx, id, LAT, LNG);
    expect(w.status, w.text).toBe(400);
    expect(String((w.body as { message?: string })?.message ?? '')).toContain('Not the assigned provider');
    expect(await getLocation(adminCtx, id), 'admin reads 0: deleted on the provider change').toHaveLength(0);
    expect(await getLocation(customerCtx, id), 'customer reads 0').toHaveLength(0);
  });
});
