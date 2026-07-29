import { test, expect, type APIRequestContext } from '@playwright/test';
import { certificationConfigured, certificationSkipReason } from '../support/connected/qa-accounts';
import { anonContext, authedContextWithUser } from '../support/connected/qa-client';
import { createCustomerBooking, assignProvider, deleteBookingsByIds } from '../support/connected/qa-bookings';
import {
  makeTrackableBooking,
  upsertLocation,
  clearLocation,
  getLocation,
  directInsertRaw,
  directDeleteRaw,
} from '../support/connected/qa-location';

/**
 * Phase 2E — Provider Location Authorization (CONNECTED).
 *
 * Exercises the REAL provider_locations RLS + RPCs of the dedicated QA project:
 * only the booking's assigned provider may write (via upsert_provider_location) and
 * only while the booking is 'on_the_way'/'in_progress'; provider_id is server-set;
 * reads are participant-scoped; clear is provider-or-admin; the row is one-per-booking
 * (PK) and cascades on booking delete. Every booking (cascading its location) is
 * deleted in afterAll. Chromium-only; gated on certificationConfigured().
 *
 * Scope: connected database/RLS validation only — NOT live GPS acquisition, foreground/
 * background tracking, device permissions, map rendering, geofencing, the realtime
 * location UI, or native mobile behavior.
 */
const P1 = { name: 'QA Provider One', phone: '+254700000001' };
// Nairobi CBD — a valid coordinate pair used across the write tests.
const LAT = -1.2921;
const LNG = 36.8219;

test.describe('Phase 2E — Provider Location', { tag: ['@certification', '@connected'] }, () => {
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

  /** A trackable booking (assigned to provider1, status on_the_way); tracked for cleanup. */
  async function trackable() {
    const id = await makeTrackableBooking({ customerCtx, customerId, providerCtx: provider1Ctx, adminCtx, provider: { providerId: provider1Id, ...P1 } });
    bookingIds.push(id);
    return id;
  }

  // ── Write authorization ───────────────────────────────────────────────────

  test('write: the assigned provider can record a location on an active booking', { tag: ['@p1'] }, async () => {
    const bookingId = await trackable();
    expect((await upsertLocation(provider1Ctx, bookingId, LAT, LNG, 90, 5)).status, 'upsert ok').toBeLessThan(300);
    const [row] = await getLocation(adminCtx, bookingId);
    expect(row.booking_id).toBe(bookingId);
    expect(row.provider_id, 'provider_id is the assigned provider').toBe(provider1Id);
    expect(Number(row.latitude)).toBeCloseTo(LAT, 4);
    expect(Number(row.longitude)).toBeCloseTo(LNG, 4);
    expect(row.updated_at, 'timestamp persisted').toBeTruthy();
  });

  test('authorization: an unassigned provider and the customer cannot write a location', { tag: ['@p1', '@security'] }, async () => {
    const bookingId = await trackable();
    const p2 = await upsertLocation(provider2Ctx, bookingId, LAT, LNG);
    expect(p2.status, 'unassigned provider denied').toBe(400);
    expect(String((p2.body as { message?: string })?.message ?? '')).toContain('Not the assigned provider');
    expect((await upsertLocation(customerCtx, bookingId, LAT, LNG)).status, 'customer denied').toBe(400);
  });

  test('authorization: an anonymous caller cannot write a location', { tag: ['@p1', '@security'] }, async () => {
    const bookingId = await trackable();
    const anon = await anonContext();
    try {
      const res = await anon.post('/rest/v1/rpc/upsert_provider_location', {
        headers: { 'Content-Type': 'application/json' },
        data: { p_booking_id: bookingId, p_lat: LAT, p_lng: LNG, p_heading: null, p_speed: null },
      });
      expect(res.status(), 'anon write denied').toBeGreaterThanOrEqual(400);
    } finally {
      await anon.dispose();
    }
  });

  test('referential integrity: writing to an unknown booking is rejected', { tag: ['@p1', '@security'] }, async () => {
    const r = await upsertLocation(provider1Ctx, '00000000-0000-0000-0000-000000000000', LAT, LNG);
    expect(r.status).toBe(400);
    expect(String((r.body as { message?: string })?.message ?? '')).toContain('Booking not found');
  });

  test('status gate: a location can be written only while the booking is on_the_way/in_progress', { tag: ['@p1', '@security'] }, async () => {
    // Assigned but still 'provider_assigned' (not yet active for tracking).
    const booking = await createCustomerBooking(customerCtx, customerId);
    bookingIds.push(booking.id);
    await assignProvider(adminCtx, booking.id, { providerId: provider1Id, ...P1 });
    const r = await upsertLocation(provider1Ctx, booking.id, LAT, LNG);
    expect(r.status, 'not-active booking denied').toBe(400);
    expect(String((r.body as { message?: string })?.message ?? '')).toContain('not active for tracking');
  });

  test('no direct writes: the table has no write RLS policy (writes go through the RPC)', { tag: ['@p1', '@security'] }, async () => {
    const bookingId = await trackable();
    // Even the assigned provider cannot INSERT directly — only the SECURITY DEFINER RPC may write.
    expect(await directInsertRaw(provider1Ctx, bookingId, provider1Id), 'direct insert denied').not.toBe(201);
  });

  // ── Coordinate integrity ──────────────────────────────────────────────────

  test('coordinates: valid values persist; null and non-numeric are rejected', { tag: ['@p1'] }, async () => {
    const bookingId = await trackable();
    expect((await upsertLocation(provider1Ctx, bookingId, LAT, LNG)).status, 'valid coords ok').toBeLessThan(300);
    // NOT NULL columns → null is rejected.
    expect((await upsertLocation(provider1Ctx, bookingId, null, LNG)).status, 'null latitude rejected').toBe(400);
    // Non-numeric → type coercion error.
    expect((await upsertLocation(provider1Ctx, bookingId, 'abc', LNG)).status, 'malformed latitude rejected').toBe(400);
  });

  test('FINDING: out-of-range coordinates are NOT rejected (no server-side range validation)', { tag: ['@p1', '@finding'] }, async () => {
    // The schema has NO CHECK on latitude/longitude range, so values outside
    // [-90,90]/[-180,180] are accepted. Documented here as an implemented-behavior
    // gap (data-integrity), NOT asserted as desirable. See report §8/§15.
    const bookingId = await trackable();
    const r = await upsertLocation(provider1Ctx, bookingId, 200, 999);
    expect(r.status, 'out-of-range currently accepted (no validation)').toBeLessThan(300);
    const [row] = await getLocation(adminCtx, bookingId);
    expect(Number(row.latitude)).toBe(200);
  });

  // ── Update / ordering / stale ─────────────────────────────────────────────

  test('update: repeated writes update the single row in place; provider_id is not reassignable', { tag: ['@p1', '@integrity'] }, async () => {
    const bookingId = await trackable();
    await upsertLocation(provider1Ctx, bookingId, LAT, LNG);
    const first = (await getLocation(adminCtx, bookingId))[0];
    await upsertLocation(provider1Ctx, bookingId, LAT + 0.01, LNG + 0.01);
    const rows = await getLocation(adminCtx, bookingId);
    expect(rows, 'still one row per booking (PK)').toHaveLength(1);
    expect(Number(rows[0].latitude), 'latest value wins').toBeCloseTo(LAT + 0.01, 4);
    expect(rows[0].provider_id, 'provider_id stays the assigned provider').toBe(provider1Id);
    expect(new Date(String(rows[0].updated_at)).getTime(), 'updated_at advanced').toBeGreaterThanOrEqual(new Date(String(first.updated_at)).getTime());
  });

  test('stale/ordering: writes are last-write-wins with no stale-timestamp rejection', { tag: ['@p1', '@integrity'] }, async () => {
    const bookingId = await trackable();
    await upsertLocation(provider1Ctx, bookingId, 1, 1);
    // A subsequent write always overwrites — the RPC accepts no client timestamp and
    // never rejects a "stale" update (documented behavior).
    expect((await upsertLocation(provider1Ctx, bookingId, 2, 2)).status).toBeLessThan(300);
    const [row] = await getLocation(adminCtx, bookingId);
    expect(Number(row.latitude)).toBe(2);
  });

  // ── Read authorization ────────────────────────────────────────────────────

  test('read: the customer, assigned provider, and admin can read; others cannot', { tag: ['@p1', '@security'] }, async () => {
    const bookingId = await trackable();
    await upsertLocation(provider1Ctx, bookingId, LAT, LNG);
    expect(await getLocation(customerCtx, bookingId), 'customer reads').toHaveLength(1);
    expect(await getLocation(provider1Ctx, bookingId), 'assigned provider reads').toHaveLength(1);
    expect(await getLocation(adminCtx, bookingId), 'admin reads').toHaveLength(1);
    expect(await getLocation(provider2Ctx, bookingId), 'unrelated provider sees none').toHaveLength(0);
    const anon = await anonContext();
    try {
      const res = await anon.get(`/rest/v1/provider_locations?booking_id=eq.${bookingId}&select=booking_id`);
      expect(await res.json()).toEqual([]);
    } finally {
      await anon.dispose();
    }
  });

  // ── Delete authorization ──────────────────────────────────────────────────

  test('delete: only the assigned provider or an admin may clear a location', { tag: ['@p1', '@security'] }, async () => {
    const bookingId = await trackable();
    await upsertLocation(provider1Ctx, bookingId, LAT, LNG);

    // Customer and unrelated provider are denied.
    expect(String(((await clearLocation(customerCtx, bookingId)).body as { message?: string })?.message ?? ''), 'customer clear denied').toContain('Permission denied');
    expect((await clearLocation(provider2Ctx, bookingId)).status, 'unrelated provider clear denied').toBe(400);
    // Direct table delete is denied (no delete RLS policy).
    expect((await directDeleteRaw(provider1Ctx, bookingId)).deleted, 'direct delete removes nothing').toBe(0);

    // Assigned provider clears successfully.
    expect((await clearLocation(provider1Ctx, bookingId)).status, 'provider clear ok').toBeLessThan(300);
    expect(await getLocation(adminCtx, bookingId), 'row removed').toHaveLength(0);

    // Admin can also clear (re-create, then admin clears).
    await upsertLocation(provider1Ctx, bookingId, LAT, LNG);
    expect((await clearLocation(adminCtx, bookingId)).status, 'admin clear ok').toBeLessThan(300);
    expect(await getLocation(adminCtx, bookingId)).toHaveLength(0);
  });

  // ── Booking isolation ─────────────────────────────────────────────────────

  test('isolation: a location for one booking is not visible or writable through another', { tag: ['@p1', '@security'] }, async () => {
    const a = await trackable();
    const b = await trackable();
    await upsertLocation(provider1Ctx, a, LAT, LNG);
    expect(await getLocation(customerCtx, b), "booking B has no location from A").toHaveLength(0);
    // A location is keyed by booking_id (PK) — writing to B never touches A's row.
    await upsertLocation(provider1Ctx, b, 10, 10);
    expect(Number((await getLocation(adminCtx, a))[0].latitude), "A's row unchanged by a write to B").toBeCloseTo(LAT, 4);
  });
});
