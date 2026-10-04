import { test, expect, type APIRequestContext } from '@playwright/test';
import { certificationConfigured, certificationSkipReason } from '../support/connected/qa-accounts';
import { authedContextWithUser } from '../support/connected/qa-client';
import { setBookingStatus, deleteBookingsByIds } from '../support/connected/qa-bookings';
import { makeTrackableBooking, upsertLocation, getLocation } from '../support/connected/qa-location';

/**
 * U74-H2 — the location share lock (CONNECTED live proof; QA run sheet Line 21, Appendix B.2).
 *
 * H2 re-creates upsert_provider_location from 0018 with FOR SHARE on its booking read, so a location write and
 * a cancellation serialise. The race itself is proven on the harness (PM stage 106); these tests prove that the
 * re-created function still behaves as 0018's on QA: a write on a trackable booking succeeds and records
 * provider1, and a write after the admin cancels is refused with 'not active for tracking' (a plain RAISE,
 * P0001, which PostgREST returns as HTTP 400: the existing certified spec provider-location.spec.ts:121-122).
 * H2-L1 holds before and after U74 (@u74-pre). Every booking (and its location row) is deleted in afterAll.
 */
const P1 = { name: 'QA Provider One', phone: '+254700000001' };
const LAT = -1.2921;
const LNG = 36.8219;

test.describe('U74-H2 — location share lock', { tag: ['@certification', '@connected', '@u74', '@u74-h2'] }, () => {
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

  /** A booking assigned to provider1 and moved to on_the_way (trackable); tracked for cleanup. */
  async function trackable(): Promise<string> {
    const id = await makeTrackableBooking({ customerCtx, customerId, providerCtx: provider1Ctx, adminCtx, provider: { providerId: provider1Id, ...P1 } });
    bookingIds.push(id);
    return id;
  }

  test('H2-L1: the assigned provider records a location on a trackable booking (one row, provider1)', { tag: ['@u74-pre'] }, async () => {
    const id = await trackable();
    const w = await upsertLocation(provider1Ctx, id, LAT, LNG);
    expect(w.status, w.text).toBeLessThan(300);
    const rows = await getLocation(adminCtx, id);
    expect(rows, 'exactly one row per booking').toHaveLength(1);
    expect(rows[0].provider_id, 'provider_id is server-set to the assigned provider').toBe(provider1Id);
  });

  test('H2-L2: after the admin cancels, the provider next write is refused (not active for tracking)', async () => {
    const id = await trackable();
    expect((await upsertLocation(provider1Ctx, id, LAT, LNG)).status).toBeLessThan(300);
    expect((await setBookingStatus(adminCtx, id, 'cancelled')).row?.status, 'admin cancels').toBe('cancelled');
    const w = await upsertLocation(provider1Ctx, id, LAT + 0.001, LNG + 0.001);
    expect(w.status, w.text).toBe(400);
    expect(String((w.body as { message?: string })?.message ?? '')).toContain('not active for tracking');
  });
});
