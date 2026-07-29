import { test, expect, type APIRequestContext } from '@playwright/test';
import { certificationConfigured, certificationSkipReason } from '../support/connected/qa-accounts';
import { anonContext, authedContextWithUser } from '../support/connected/qa-client';
import { createCustomerBooking, deleteBookingsByIds } from '../support/connected/qa-bookings';
import {
  makeToken,
  insertTokenRaw,
  upsertToken,
  getTokens,
  updateTokenRaw,
  deleteTokenRaw,
  sweepTokens,
} from '../support/connected/qa-push';

/**
 * Phase 2F — Push device-token authorization (CONNECTED).
 *
 * Exercises the REAL device_tokens RLS + constraints of the dedicated QA project:
 * owner-only registration/update/delete, admin read-only oversight, unrelated/anon
 * denial, the (user_id, push_token) uniqueness + upsert idempotency, ownership
 * behavior for a shared token, platform/provider validation, and the notification
 * dispatch scaffolding — all WITHOUT sending any external push. Tokens are synthetic
 * QA data (prefixed) swept in afterAll; the shared QA accounts are never deleted.
 *
 * Scope: device-token database/RLS + notification-record creation only — NOT actual
 * push dispatch, provider acceptance, APNs/FCM/Expo delivery, or native receipt.
 */
test.describe('Phase 2F — Push device tokens', { tag: ['@certification', '@connected'] }, () => {
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
    await sweepTokens(); // remove every QA-P2F-* token (service role) — QA accounts untouched
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

  // ── Registration ──────────────────────────────────────────────────────────

  test('registration: an authenticated user registers their own token, linked to them', { tag: ['@p1'] }, async () => {
    const push = makeToken('own');
    const r = await insertTokenRaw(customerCtx, { user_id: customerId, push_token: push, platform: 'android', provider: 'expo', device_name: 'QA Device' });
    expect(r.status, 'own token registered').toBe(201);
    const [row] = await getTokens(customerCtx, push);
    expect(row.user_id).toBe(customerId);
    expect(row.platform).toBe('android');
    expect(row.provider).toBe('expo');
    expect(row.last_seen_at, 'timestamp persisted').toBeTruthy();
  });

  test('authorization: a user cannot register a token on behalf of another user', { tag: ['@p1', '@security'] }, async () => {
    const r = await insertTokenRaw(customerCtx, { user_id: provider1Id, push_token: makeToken('spoof') });
    expect(r.status, 'registering for another user denied').not.toBe(201);
  });

  test('authorization: an anonymous caller cannot register a token', { tag: ['@p1', '@security'] }, async () => {
    const anon = await anonContext();
    try {
      const res = await anon.post('/rest/v1/device_tokens', {
        headers: { 'Content-Type': 'application/json' },
        data: { user_id: customerId, push_token: makeToken('anon'), platform: 'android' },
      });
      expect([401, 403]).toContain(res.status());
    } finally {
      await anon.dispose();
    }
  });

  // ── Duplicate / idempotency ───────────────────────────────────────────────

  test('idempotency: re-registering the same (user, token) is deduped by the unique key', { tag: ['@p1', '@integrity'] }, async () => {
    const push = makeToken('dup');
    expect((await insertTokenRaw(customerCtx, { user_id: customerId, push_token: push })).status).toBe(201);
    // A plain second insert violates unique(user_id, push_token).
    expect((await insertTokenRaw(customerCtx, { user_id: customerId, push_token: push })).status, 'duplicate insert rejected').toBe(409);
    // The edge's re-registration path is an idempotent upsert — no second row.
    expect(await upsertToken(customerCtx, { user_id: customerId, push_token: push, device_name: 'renamed' })).toBeLessThan(300);
    expect(await getTokens(customerCtx, push), 'still exactly one row').toHaveLength(1);
  });

  test('FINDING: the same token registered by two users creates two rows (no global token uniqueness)', { tag: ['@p1', '@finding', '@security'] }, async () => {
    // unique is (user_id, push_token), NOT (push_token) — the same device token can be
    // owned by multiple users (separate rows). Documented as a finding; see report §7/§17.
    const push = makeToken('shared');
    expect((await insertTokenRaw(customerCtx, { user_id: customerId, push_token: push })).status).toBe(201);
    expect((await insertTokenRaw(provider1Ctx, { user_id: provider1Id, push_token: push })).status, 'second user accepted (separate row)').toBe(201);
    // Each owner sees only their own row (RLS user_id scope).
    expect(await getTokens(customerCtx, push), 'customer sees only own row').toHaveLength(1);
    expect(await getTokens(provider1Ctx, push), 'provider sees only own row').toHaveLength(1);
    expect(await getTokens(adminCtx, push), 'admin oversight sees both').toHaveLength(2);
  });

  // ── Update ────────────────────────────────────────────────────────────────

  test('update: the owner can update metadata; a non-owner cannot, and ownership cannot be reassigned', { tag: ['@p1', '@security'] }, async () => {
    const push = makeToken('upd');
    const ins = await insertTokenRaw(customerCtx, { user_id: customerId, push_token: push, device_name: 'orig' });
    const id = ins.id as string;
    expect((await updateTokenRaw(customerCtx, id, { device_name: 'updated' })).changed, 'owner update ok').toBe(1);
    expect((await updateTokenRaw(provider2Ctx, id, { device_name: 'hijack' })).changed, 'non-owner update changes nothing').toBe(0);
    // WITH CHECK pins user_id = auth.uid() — reassigning ownership is rejected.
    const reassign = await updateTokenRaw(customerCtx, id, { user_id: provider1Id });
    expect(reassign.changed, 'ownership reassignment rejected').toBe(0);
  });

  test('validation: unsupported platform and provider values are rejected', { tag: ['@p1', '@security'] }, async () => {
    expect((await insertTokenRaw(customerCtx, { user_id: customerId, push_token: makeToken('plat'), platform: 'windows' })).status, 'bad platform rejected').toBe(400);
    expect((await insertTokenRaw(customerCtx, { user_id: customerId, push_token: makeToken('prov'), provider: 'onesignal' })).status, 'bad provider rejected').toBe(400);
  });

  test('validation: a null token is rejected; FINDING: an empty token is accepted (no non-empty check)', { tag: ['@p1', '@finding'] }, async () => {
    // NOT NULL rejects null.
    expect((await insertTokenRaw(customerCtx, { user_id: customerId, push_token: null })).status, 'null token rejected (NOT NULL)').toBe(400);
    // push_token is `text NOT NULL` with NO non-empty/length CHECK — '' is accepted at the DB
    // layer (the register-device edge rejects a falsy token, but the table does not). Documented
    // (§8/§17). The empty row is deleted immediately so no residual/unmarked row remains.
    const empty = await insertTokenRaw(customerCtx, { user_id: customerId, push_token: '' });
    expect(empty.status, 'empty token accepted at the DB layer (no server-side non-empty check)').toBe(201);
    expect((await deleteTokenRaw(customerCtx, empty.id as string)).deleted, 'empty-token row cleaned up in-test').toBe(1);
  });

  // ── Delete / unregister ───────────────────────────────────────────────────

  test('unregister: the owner can delete; others (incl. admin write) cannot; repeats are deterministic', { tag: ['@p1', '@security'] }, async () => {
    const push = makeToken('del');
    const ins = await insertTokenRaw(customerCtx, { user_id: customerId, push_token: push });
    const id = ins.id as string;
    // Non-owner and admin have NO delete path (admin is read-only).
    expect((await deleteTokenRaw(provider2Ctx, id)).deleted, 'non-owner delete removes nothing').toBe(0);
    expect((await deleteTokenRaw(adminCtx, id)).deleted, 'admin delete removes nothing (read-only)').toBe(0);
    // Owner deletes their own token.
    expect((await deleteTokenRaw(customerCtx, id)).deleted, 'owner unregister ok').toBe(1);
    // Repeated unregister is a no-op (already gone).
    expect((await deleteTokenRaw(customerCtx, id)).deleted, 'repeat unregister deterministic').toBe(0);
    expect(await getTokens(adminCtx, push), 'row removed').toHaveLength(0);
  });

  // ── Read authorization ────────────────────────────────────────────────────

  test('read: a user reads only their own tokens; admin has oversight; others and anon see none', { tag: ['@p1', '@security'] }, async () => {
    const push = makeToken('read');
    await insertTokenRaw(customerCtx, { user_id: customerId, push_token: push });
    expect(await getTokens(customerCtx, push), 'owner reads own').toHaveLength(1);
    expect(await getTokens(adminCtx, push), 'admin oversight reads').toHaveLength(1);
    expect(await getTokens(provider2Ctx, push), 'unrelated user sees none').toHaveLength(0);
    const anon = await anonContext();
    try {
      const res = await anon.get(`/rest/v1/device_tokens?push_token=eq.${encodeURIComponent(push)}&select=id`);
      expect(await res.json()).toEqual([]);
    } finally {
      await anon.dispose();
    }
  });

  // ── Notification relationship (no external delivery) ──────────────────────

  test('notification relationship: a created notification carries a push_status; delivery is not exercised', { tag: ['@p1'] }, async () => {
    const booking = await createCustomerBooking(customerCtx, customerId);
    bookingIds.push(booking.id);
    // The booking insert fires tg_notify_booking_created → a customer notification with push_status.
    const res = await customerCtx.get(`/rest/v1/notifications?booking_id=eq.${booking.id}&select=id,user_id,push_status&limit=1`);
    expect(res.status()).toBe(200);
    const rows = (await res.json()) as Record<string, unknown>[];
    expect(rows.length, 'a notification was created').toBeGreaterThan(0);
    expect(rows[0].push_status, 'notification carries a push_status (dispatch scaffolding)').toBeTruthy();
    // Sanity: the notification belongs to the customer (who owns any device tokens used for delivery).
    expect(rows[0].user_id).toBe(customerId);
  });
});
