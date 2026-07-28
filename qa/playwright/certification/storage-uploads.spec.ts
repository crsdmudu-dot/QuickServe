import { test, expect, type APIRequestContext } from '@playwright/test';
import { certificationConfigured, certificationSkipReason } from '../support/connected/qa-accounts';
import { authedContextWithUser, signIn } from '../support/connected/qa-client';
import { createCustomerBooking, assignProvider, deleteBookingsByIds } from '../support/connected/qa-bookings';
import {
  uploadObject,
  getObjectStatus,
  makeObjectPath,
  insertBookingPhotoRaw,
  readBookingPhotos,
} from '../support/connected/qa-storage';

/**
 * Phase 1B — Storage & uploads (CONNECTED).
 *
 * Exercises the real booking_photos metadata RLS (the app's photo access boundary)
 * plus object-level negatives on the dedicated QA project: the booking-scoped
 * authorization (customer→issue, assigned-provider→before/after/completion), the
 * invalid photo_type check constraint, the admin-only verified guard, anonymous
 * object-upload denial, and missing-object handling. The created booking is deleted
 * in afterAll (cascading its photo metadata). Chromium-only; gated on
 * certificationConfigured() (never targets production).
 *
 * NOTE: direct authenticated object uploads to the private bucket are denied by the
 * QA project's deployed storage.objects policy (stricter than migration 0006 —
 * a local↔remote drift, see F3), so object-level upload SUCCESS is not asserted
 * here; the metadata table is the authorization boundary the app enforces.
 */
test.describe('Phase 1B — Storage & uploads', { tag: ['@certification', '@connected'] }, () => {
  let customerCtx: APIRequestContext;
  let customerId: string;
  let provider1Ctx: APIRequestContext;
  let provider1Id: string;
  let provider2Ctx: APIRequestContext;
  let provider2Id: string;
  let adminCtx: APIRequestContext;
  let adminId: string;
  let customerToken: string;
  let bookingId: string;

  test.beforeAll(async ({}, testInfo) => {
    if (!certificationConfigured() || testInfo.project.name !== 'chromium') return;
    const c = await authedContextWithUser('customer');
    customerCtx = c.ctx;
    customerId = c.userId;
    const p1 = await authedContextWithUser('provider1');
    provider1Ctx = p1.ctx;
    provider1Id = p1.userId;
    const p2 = await authedContextWithUser('provider2');
    provider2Ctx = p2.ctx;
    provider2Id = p2.userId;
    const a = await authedContextWithUser('admin');
    adminCtx = a.ctx;
    adminId = a.userId;
    customerToken = await signIn('customer');
    const created = await createCustomerBooking(customerCtx, customerId);
    bookingId = created.id;
    await assignProvider(adminCtx, bookingId, {
      providerId: provider1Id,
      name: 'QA Provider One',
      phone: '+254700000001',
    });
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

  test('metadata upload success: a customer can attach an issue photo to their own booking', { tag: ['@p1'] }, async () => {
    const r = await insertBookingPhotoRaw(customerCtx, {
      booking_id: bookingId,
      uploaded_by: customerId,
      photo_type: 'issue',
    });
    expect(r.status, 'customer issue photo accepted').toBe(201);
    const rows = await readBookingPhotos(customerCtx, bookingId);
    expect(rows.some((row) => row.photo_type === 'issue')).toBe(true);
  });

  test('metadata authorization: a customer cannot attach a provider-only photo type', { tag: ['@p1', '@security'] }, async () => {
    const r = await insertBookingPhotoRaw(customerCtx, {
      booking_id: bookingId,
      uploaded_by: customerId,
      photo_type: 'before', // provider-only per booking_photos_insert RLS
    });
    expect(r.status, "customer 'before' photo denied").not.toBe(201);
  });

  test('metadata authorization: the assigned provider can attach a before photo', { tag: ['@p1'] }, async () => {
    const r = await insertBookingPhotoRaw(provider1Ctx, {
      booking_id: bookingId,
      uploaded_by: provider1Id,
      photo_type: 'before',
    });
    expect(r.status, 'assigned provider before photo accepted').toBe(201);
  });

  test('metadata authorization: an unassigned provider cannot attach a photo', { tag: ['@p1', '@security'] }, async () => {
    const r = await insertBookingPhotoRaw(provider2Ctx, {
      booking_id: bookingId,
      uploaded_by: provider2Id,
      photo_type: 'before',
    });
    expect(r.status, 'unassigned provider photo denied').not.toBe(201);
  });

  test('invalid file: an unknown photo_type is rejected by the check constraint', { tag: ['@p1', '@security'] }, async () => {
    // Use admin so the booking-scope RLS passes and the CHECK constraint is the rejecter.
    const r = await insertBookingPhotoRaw(adminCtx, {
      booking_id: bookingId,
      uploaded_by: adminId,
      photo_type: 'selfie', // not in ('issue','before','after','completion')
    });
    expect(r.status, 'invalid photo_type rejected by check constraint').toBe(400);
  });

  test('verified guard: a non-admin cannot create an already-verified photo', { tag: ['@p1', '@security'] }, async () => {
    const r = await insertBookingPhotoRaw(customerCtx, {
      booking_id: bookingId,
      uploaded_by: customerId,
      photo_type: 'issue',
      is_verified: true, // only admin may create a verified photo
    });
    expect(r.status, 'non-admin verified photo denied').not.toBe(201);
  });

  test('object authorization: an anonymous caller cannot upload to the bucket', { tag: ['@p1', '@security'] }, async () => {
    const status = await uploadObject(null, makeObjectPath('anon'));
    expect(status, 'anon object upload denied').not.toBe(200);
    expect([400, 401, 403]).toContain(status);
  });

  test('missing file: downloading a non-existent object returns an error', { tag: ['@p2'] }, async () => {
    const status = await getObjectStatus(customerToken, makeObjectPath('missing'));
    expect(status, 'missing object is not 200').not.toBe(200);
    expect([400, 404]).toContain(status);
  });
});
