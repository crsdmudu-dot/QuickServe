import { test, expect } from '@playwright/test';
import { certificationConfigured, certificationSkipReason } from '../support/connected/qa-accounts';
import { anonContext, authedContext, authedContextWithUser, hasServiceRole } from '../support/connected/qa-client';
import {
  createCustomerBooking,
  makeBookingMarker,
  assignProvider,
  setBookingStatus,
  insertBookingRaw,
  readBookingById,
  readBookingActivity,
  readBookingNotifications,
  deleteBookingsByIds,
  sweepCertificationBookings,
} from '../support/connected/qa-bookings';

/**
 * Launch Certification — Integrity, concurrency & replay (QA Slice 44A, M7).
 *
 * Characterizes booking integrity under duplicate, concurrent, and replayed
 * operations against the real QA backend. Several tests DOCUMENT defects by
 * asserting the ACTUAL behavior (not weakened) — see the report for reproduction,
 * severity, and mitigation. Real authenticated API; service-role for teardown only.
 */
const P1 = { name: 'QA Provider One', phone: '+254700000001' };
const P2 = { name: 'QA Provider Two', phone: '+254700000002' };

test.describe('Launch Certification — Integrity & concurrency', { tag: ['@certification', '@connected', '@integrity'] }, () => {
  const createdIds: string[] = [];

  test.beforeEach(({}, testInfo) => {
    test.skip(!certificationConfigured(), certificationSkipReason());
    test.skip(!hasServiceRole(), 'Cleanup requires QA_SERVICE_ROLE_KEY.');
    test.skip(testInfo.project.name !== 'chromium', 'Launch Certification is Chromium-only.');
    createdIds.length = 0;
  });

  test.afterEach(async () => {
    await deleteBookingsByIds(createdIds);
    createdIds.length = 0;
  });

  test.afterAll(async () => {
    if (certificationConfigured() && hasServiceRole()) await sweepCertificationBookings();
  });

  test(
    'B2 (P0): duplicate submissions are rejected by idempotency key, not by slot similarity',
    { tag: ['@p0', '@integrity'] },
    async () => {
      // THE CONTRACT (migrations 0034 and 0039).
      //
      // 0033 originally blocked a second ACTIVE booking sharing customer + service +
      // scheduled_for, via the partial unique index bookings_active_dedup. 0034 dropped that
      // index deliberately: it over-blocked legitimate distinct jobs that share a service and a
      // deterministic time but differ by address or unit (two "tomorrow morning" jobs on
      // different floors of one building). 0039 re-applied the same end state forward after a
      // migration-version collision, and src/__tests__/service-details-schema.test.ts actively
      // forbids re-creating the old index.
      //
      // Duplicate identity is therefore CLIENT INTENT, not field similarity: one logical
      // submission carries one idempotency_key and reuses it across retries, while a genuinely
      // new booking ("book another anyway") carries a new key. bookings_idempotency_key_uidx is
      // partial (WHERE idempotency_key IS NOT NULL), so legacy key-less rows coexist freely.
      //
      // The P0 guarantee is unchanged in strength: one logical submission can never create two
      // rows. Only the key it is enforced on changed.
      const { ctx: customer, userId } = await authedContextWithUser('customer');
      try {
        const slot = '2030-03-01T09:00:00.000Z';
        // One payload shape; only the idempotency key varies between the cases below.
        const body = (marker: string, idempotencyKey: string) => ({
          customer_id: userId,
          service_id: 'house-cleaning',
          address: 'QA Dedup Address',
          scheduled_for: slot,
          notes: marker,
          idempotency_key: idempotencyKey,
        });

        // ── Sequential, SAME key: the retry must not create a second row. ──
        const sequentialKey = crypto.randomUUID();
        const first = await insertBookingRaw(customer, body(makeBookingMarker(), sequentialKey));
        expect(first.status).toBe(201);
        expect(first.id).not.toBeNull();
        createdIds.push(first.id as string);

        const retry = await insertBookingRaw(customer, body(makeBookingMarker(), sequentialKey));
        expect(retry.status, 'same idempotency key rejected').toBe(409);
        expect(retry.id).toBeNull();
        // Exactly one row exists for that submission.
        expect(await readBookingById(customer, first.id as string)).toHaveLength(1);

        // ── Concurrent, SAME key: exactly one wins, race-safe at the index. ──
        const concurrentKey = crypto.randomUUID();
        const [c1, c2] = await Promise.all([
          insertBookingRaw(customer, body(makeBookingMarker(), concurrentKey)),
          insertBookingRaw(customer, body(makeBookingMarker(), concurrentKey)),
        ]);
        // Capture BEFORE asserting, so a failure here still cleans up whatever committed.
        for (const r of [c1, c2]) if (r.id) createdIds.push(r.id);
        expect([c1.status, c2.status].sort(), 'exactly one 201 and one 409').toEqual([201, 409]);

        // ── DISTINCT keys, otherwise identical: both must succeed. ──
        // This is the regression guard for what 0034 set out to fix, and it fails if the coarse
        // bookings_active_dedup index is ever restored.
        const [d1, d2] = await Promise.all([
          insertBookingRaw(customer, body(makeBookingMarker(), crypto.randomUUID())),
          insertBookingRaw(customer, body(makeBookingMarker(), crypto.randomUUID())),
        ]);
        for (const r of [d1, d2]) if (r.id) createdIds.push(r.id);
        expect(
          [d1.status, d2.status],
          'distinct keys at the same customer/service/address/time both succeed',
        ).toEqual([201, 201]);
      } finally {
        await customer.dispose();
      }
    },
  );

  test(
    'concurrent provider assignment is last-write-wins with no optimistic lock (no lost booking, no duplicate audit)',
    { tag: ['@p1', '@finding'] },
    async () => {
      const { ctx: customer, userId } = await authedContextWithUser('customer');
      const { userId: p1Id } = await authedContextWithUser('provider1');
      const { userId: p2Id } = await authedContextWithUser('provider2');
      const admin = await authedContext('admin');
      try {
        const created = await createCustomerBooking(customer, userId);
        createdIds.push(created.id);

        // Two admins assign different providers at the same instant.
        const [r1, r2] = await Promise.all([
          assignProvider(admin, created.id, { providerId: p1Id, ...P1 }),
          assignProvider(admin, created.id, { providerId: p2Id, ...P2 }),
        ]);
        expect(r1.status).toBe('provider_assigned');
        expect(r2.status).toBe('provider_assigned');

        // Invariant: exactly one winner (last-write-wins), never null, never split.
        const finalRow = (await readBookingById(admin, created.id))[0];
        expect([p1Id, p2Id]).toContain(finalRow.assigned_provider_id);
        expect(finalRow.status).toBe('provider_assigned');
        // No duplicate status audit from the racing writes (creation + one assign).
        const activity = await readBookingActivity(admin, created.id);
        expect(activity.filter((x) => x.event_type === 'provider_assigned')).toHaveLength(1);
      } finally {
        await customer.dispose();
        await admin.dispose();
      }
    },
  );

  test(
    'F4 FIXED (P1): a cancelled booking is terminal — the assigned provider cannot complete it',
    { tag: ['@p1', '@integrity', '@security'] },
    async () => {
      const { ctx: customer, userId } = await authedContextWithUser('customer');
      const { ctx: p1, userId: p1Id } = await authedContextWithUser('provider1');
      const admin = await authedContext('admin');
      try {
        const created = await createCustomerBooking(customer, userId);
        createdIds.push(created.id);
        await assignProvider(admin, created.id, { providerId: p1Id, ...P1 });

        // Admin cancels the booking.
        expect((await setBookingStatus(admin, created.id, 'cancelled')).row?.status).toBe('cancelled');

        // The assigned provider can no longer drive it forward (migration 0034:
        // the pre-update status must be provider_assigned/on_the_way/in_progress).
        for (const attempt of ['completed', 'in_progress', 'on_the_way'] as const) {
          const r = await setBookingStatus(p1, created.id, attempt);
          expect(r.changed, `provider cannot move cancelled → ${attempt}`).toBe(false);
        }
        // Cancellation stands.
        expect((await readBookingById(admin, created.id))[0].status).toBe('cancelled');
      } finally {
        await customer.dispose();
        await p1.dispose();
        await admin.dispose();
      }
    },
  );

  test(
    'replay of an identical mutation causes no duplicate effects (idempotent for unchanged state)',
    { tag: ['@p1'] },
    async () => {
      const { ctx: customer, userId } = await authedContextWithUser('customer');
      const { ctx: p1, userId: p1Id } = await authedContextWithUser('provider1');
      const admin = await authedContext('admin');
      try {
        const created = await createCustomerBooking(customer, userId);
        createdIds.push(created.id);
        await assignProvider(admin, created.id, { providerId: p1Id, ...P1 });

        const actBefore = (await readBookingActivity(admin, created.id)).length;
        const notifBefore = (await readBookingNotifications(customer, created.id)).length;
        // Replay the exact same assignment (identical payload → no state change).
        await assignProvider(admin, created.id, { providerId: p1Id, ...P1 });
        expect((await readBookingActivity(admin, created.id)).length, 'no duplicate audit on replay').toBe(actBefore);
        expect((await readBookingNotifications(customer, created.id)).length, 'no duplicate notification on replay').toBe(
          notifBefore,
        );
      } finally {
        await customer.dispose();
        await p1.dispose();
        await admin.dispose();
      }
    },
  );

  test(
    'a failed insert is atomic — no partial or orphaned rows; a valid insert logs exactly one creation',
    { tag: ['@p1'] },
    async () => {
      const { ctx: customer, userId } = await authedContextWithUser('customer');
      let anon = undefined;
      try {
        // Invalid status value violates the CHECK constraint → the whole insert fails.
        const bad = await insertBookingRaw(customer, {
          customer_id: userId,
          service_id: 'house-cleaning',
          address: 'A',
          scheduled_for: '2030-06-01T09:00:00Z',
          notes: makeBookingMarker(),
          status: 'not_a_status',
        });
        expect(bad.status, 'invalid insert rejected').toBeGreaterThanOrEqual(400);
        expect(bad.id, 'no row persisted from a failed insert').toBeNull();

        // A valid booking commits fully and logs exactly one creation activity.
        const ok = await createCustomerBooking(customer, userId);
        createdIds.push(ok.id);
        const activity = await readBookingActivity(customer, ok.id);
        expect(activity.map((a) => a.event_type)).toEqual(['booking_created']);

        // Anonymous cannot insert at all (RLS) — no orphan rows possible from anon.
        anon = await anonContext();
        const anonInsert = await insertBookingRaw(anon, {
          customer_id: userId,
          service_id: 'x',
          address: 'x',
          scheduled_for: '2030-06-01T09:00:00Z',
          notes: makeBookingMarker(),
        });
        expect(anonInsert.id, 'anon cannot create a booking').toBeNull();
      } finally {
        await customer.dispose();
        await anon?.dispose();
      }
    },
  );
});
