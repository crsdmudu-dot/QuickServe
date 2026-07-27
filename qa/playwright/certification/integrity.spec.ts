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
    'B2 FIXED (P0): a duplicate active booking is rejected server-side (sequential + concurrent)',
    { tag: ['@p0', '@integrity'] },
    async () => {
      const { ctx: customer, userId } = await authedContextWithUser('customer');
      try {
        // Identical payload = same customer, service, scheduled_for, address, notes.
        // (migration 0033 partial unique index over active statuses).
        const seqSlot = '2030-03-01T09:00:00.000Z';
        const body = (marker: string, slot: string) => ({
          customer_id: userId,
          service_id: 'house-cleaning',
          address: 'QA Dedup Address',
          scheduled_for: slot,
          notes: marker,
        });

        // Sequential: first commits (201), the identical second is REJECTED (409).
        const first = await insertBookingRaw(customer, body(makeBookingMarker(), seqSlot));
        expect(first.status).toBe(201);
        expect(first.id).not.toBeNull();
        createdIds.push(first.id as string);
        const second = await insertBookingRaw(customer, body(makeBookingMarker(), seqSlot));
        expect(second.status, 'duplicate active booking rejected').toBe(409);
        expect(second.id).toBeNull();
        // Exactly one active booking exists for that slot.
        expect(await readBookingById(customer, first.id as string)).toHaveLength(1);

        // Concurrent: two identical inserts at once → exactly one wins, one 409.
        const concSlot = '2030-03-01T10:00:00.000Z';
        const [c1, c2] = await Promise.all([
          insertBookingRaw(customer, body(makeBookingMarker(), concSlot)),
          insertBookingRaw(customer, body(makeBookingMarker(), concSlot)),
        ]);
        const codes = [c1.status, c2.status].sort();
        expect(codes, 'exactly one 201 and one 409').toEqual([201, 409]);
        const winner = c1.status === 201 ? c1.id : c2.id;
        createdIds.push(winner as string);

        // Once the first booking is terminal (cancelled), the slot frees up again.
        const admin = await authedContext('admin');
        try {
          await setBookingStatus(admin, first.id as string, 'cancelled');
          const rebook = await insertBookingRaw(customer, body(makeBookingMarker(), seqSlot));
          expect(rebook.status, 'slot re-bookable after prior booking is terminal').toBe(201);
          if (rebook.id) createdIds.push(rebook.id);
        } finally {
          await admin.dispose();
        }
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
