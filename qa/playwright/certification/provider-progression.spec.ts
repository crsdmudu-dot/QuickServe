import { test, expect, type APIRequestContext } from '@playwright/test';
import { certificationConfigured, certificationSkipReason } from '../support/connected/qa-accounts';
import {
  anonContext,
  authedContext,
  authedContextWithUser,
  hasServiceRole,
} from '../support/connected/qa-client';
import {
  createAssignedBooking,
  readBookingById,
  setBookingStatus,
  patchBooking,
  readBookingActivity,
  deleteBookingsByIds,
  sweepCertificationBookings,
} from '../support/connected/qa-bookings';

/**
 * Launch Certification — Provider progression (QA Slice 44A, Milestone 5).
 *
 * Certifies the provider job workflow against the real QA backend using the same
 * authenticated PostgREST path the app uses (updateBookingStatus). Real bookings;
 * service-role is used ONLY for cleanup. Serial + session-cached.
 *
 * DESIGN FINDING (see report): the provider RLS enforces FORWARD-ONLY progression
 * via `rank(new) > rank(old)`, which BLOCKS backward/reopen/repeat transitions but
 * intentionally PERMITS forward-skips (e.g. provider_assigned → completed). This
 * matches the provider-experience design spec; single-step is a UI-only convention.
 * The tests certify the ACTUAL behavior (no faked rejections).
 */
const P1 = { name: 'QA Provider One', phone: '+254700000001' };

test.describe('Launch Certification — Provider progression', { tag: ['@certification', '@connected'] }, () => {
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

  test('an assigned job is visible only to its provider, owner and admin', { tag: ['@p0', '@security'] }, async () => {
    const { ctx: customer, userId: customerId } = await authedContextWithUser('customer');
    const { ctx: p1, userId: p1Id } = await authedContextWithUser('provider1');
    const p2 = await authedContext('provider2');
    const admin = await authedContext('admin');
    let anon: APIRequestContext | undefined;
    try {
      const b = await createAssignedBooking(customer, customerId, admin, { providerId: p1Id, ...P1 });
      createdIds.push(b.id);

      expect(await readBookingById(p1, b.id), 'assigned provider sees it').toHaveLength(1);
      expect(await readBookingById(p2, b.id), 'other provider cannot').toHaveLength(0);
      anon = await anonContext();
      expect(await readBookingById(anon, b.id), 'anon cannot').toHaveLength(0);
      expect(await readBookingById(customer, b.id), 'owner sees it').toHaveLength(1);
      expect(await readBookingById(admin, b.id), 'admin sees it').toHaveLength(1);
    } finally {
      await customer.dispose();
      await p1.dispose();
      await p2.dispose();
      await admin.dispose();
      await anon?.dispose();
    }
  });

  test('provider advances provider_assigned → on_the_way → in_progress → completed', { tag: ['@p0'] }, async () => {
    const { ctx: customer, userId: customerId } = await authedContextWithUser('customer');
    const { ctx: p1, userId: p1Id } = await authedContextWithUser('provider1');
    const admin = await authedContext('admin');
    try {
      const b = await createAssignedBooking(customer, customerId, admin, { providerId: p1Id, ...P1 });
      createdIds.push(b.id);

      for (const next of ['on_the_way', 'in_progress', 'completed'] as const) {
        const before = (await readBookingActivity(admin, b.id)).length;
        const r = await setBookingStatus(p1, b.id, next);
        expect(r.changed, `transition to ${next} accepted`).toBe(true);
        expect(r.row?.status).toBe(next);
        // assigned_provider_id must never change during progression.
        expect(r.row?.assigned_provider_id).toBe(p1Id);

        // Read back the exact persisted status + unchanged assignment.
        const rows = await readBookingById(admin, b.id);
        expect(rows[0].status).toBe(next);
        expect(rows[0].assigned_provider_id).toBe(p1Id);

        // An audit row was recorded for this transition.
        expect((await readBookingActivity(admin, b.id)).length).toBeGreaterThan(before);

        // Visibility holds at each step: provider, owner, admin.
        expect(await readBookingById(p1, b.id)).toHaveLength(1);
        expect(await readBookingById(customer, b.id)).toHaveLength(1);
        expect(await readBookingById(admin, b.id)).toHaveLength(1);
      }
    } finally {
      await customer.dispose();
      await p1.dispose();
      await admin.dispose();
    }
  });

  test('provider-only transitions are denied to other roles and metadata is pinned', { tag: ['@p0', '@security'] }, async () => {
    const { ctx: customer, userId: customerId } = await authedContextWithUser('customer');
    const { ctx: p1, userId: p1Id } = await authedContextWithUser('provider1');
    const p2 = await authedContext('provider2');
    const admin = await authedContext('admin');
    let anon: APIRequestContext | undefined;
    try {
      const b = await createAssignedBooking(customer, customerId, admin, { providerId: p1Id, ...P1 });
      createdIds.push(b.id);

      // Provider 2 (unassigned) cannot progress Provider 1's booking.
      expect((await setBookingStatus(p2, b.id, 'on_the_way')).changed, 'other provider blocked').toBe(false);
      // Anonymous cannot update.
      anon = await anonContext();
      expect((await setBookingStatus(anon, b.id, 'on_the_way')).changed, 'anon blocked').toBe(false);
      // Customer cannot perform provider-only transitions (no customer UPDATE policy).
      expect((await setBookingStatus(customer, b.id, 'on_the_way')).changed, 'customer blocked').toBe(false);
      // Provider cannot alter assignment/dispatch metadata (RLS pins it).
      const meta = await patchBooking(p1, b.id, { status: 'on_the_way', assigned_provider_name: 'HACKED' });
      expect(meta.changed, 'provider cannot rewrite assignment metadata').toBe(false);
      expect(meta.status).toBeGreaterThanOrEqual(400);

      // The booking is untouched by every denied attempt.
      const rows = await readBookingById(admin, b.id);
      expect(rows[0].status).toBe('provider_assigned');
      expect(rows[0].assigned_provider_id).toBe(p1Id);
      expect(rows[0].assigned_provider_name).toBe(P1.name);
    } finally {
      await customer.dispose();
      await p1.dispose();
      await p2.dispose();
      await admin.dispose();
      await anon?.dispose();
    }
  });

  test('backward, reopen and repeat transitions are rejected with no state change or false audit', { tag: ['@p0'] }, async () => {
    const { ctx: customer, userId: customerId } = await authedContextWithUser('customer');
    const { ctx: p1, userId: p1Id } = await authedContextWithUser('provider1');
    const admin = await authedContext('admin');
    try {
      const b = await createAssignedBooking(customer, customerId, admin, { providerId: p1Id, ...P1 });
      createdIds.push(b.id);
      await setBookingStatus(p1, b.id, 'on_the_way');
      await setBookingStatus(p1, b.id, 'in_progress');

      // Reverse in_progress → on_the_way is rejected; state + audit unchanged.
      let audit = (await readBookingActivity(admin, b.id)).length;
      let r = await setBookingStatus(p1, b.id, 'on_the_way');
      expect(r.changed, 'reverse rejected').toBe(false);
      expect((await readBookingById(admin, b.id))[0].status).toBe('in_progress');
      expect((await readBookingActivity(admin, b.id)).length, 'no false audit on reverse').toBe(audit);

      // Complete, then reopen completed → in_progress is rejected.
      await setBookingStatus(p1, b.id, 'completed');
      audit = (await readBookingActivity(admin, b.id)).length;
      r = await setBookingStatus(p1, b.id, 'in_progress');
      expect(r.changed, 'reopen rejected').toBe(false);
      expect((await readBookingById(admin, b.id))[0].status).toBe('completed');

      // IDEMPOTENCY: repeating the same status is REJECTED (not silently accepted)
      // and creates NO duplicate audit row.
      r = await setBookingStatus(p1, b.id, 'completed');
      expect(r.changed, 'repeat same-status rejected').toBe(false);
      expect((await readBookingById(admin, b.id))[0].status).toBe('completed');
      expect((await readBookingActivity(admin, b.id)).length, 'no duplicate audit on repeat').toBe(audit);
    } finally {
      await customer.dispose();
      await p1.dispose();
      await admin.dispose();
    }
  });

  test('FINDING: forward progression is forward-only but NOT single-step (forward-skip permitted by design)', { tag: ['@p1', '@finding'] }, async () => {
    // The provider RLS uses rank(new) > rank(old), so a legitimately-assigned
    // provider may jump forward across steps (e.g. provider_assigned → completed).
    // This is intentional per the provider-experience design; single-step is a
    // UI-only convention. Certified as the ACTUAL behavior — see report (P2 hardening).
    const { ctx: customer, userId: customerId } = await authedContextWithUser('customer');
    const { ctx: p1, userId: p1Id } = await authedContextWithUser('provider1');
    const admin = await authedContext('admin');
    try {
      const b = await createAssignedBooking(customer, customerId, admin, { providerId: p1Id, ...P1 });
      createdIds.push(b.id);

      const r = await setBookingStatus(p1, b.id, 'completed'); // skip on_the_way + in_progress
      expect(r.changed, 'forward-skip is permitted by design').toBe(true);
      expect(r.row?.status).toBe('completed');
      expect(r.row?.assigned_provider_id).toBe(p1Id);
    } finally {
      await customer.dispose();
      await p1.dispose();
      await admin.dispose();
    }
  });
});
