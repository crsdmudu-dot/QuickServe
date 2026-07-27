import { test, expect, type APIRequestContext } from '@playwright/test';
import { certificationConfigured, certificationSkipReason } from '../support/connected/qa-accounts';
import {
  anonContext,
  authedContext,
  authedContextWithUser,
  hasServiceRole,
} from '../support/connected/qa-client';
import {
  createCustomerBooking,
  readBookingById,
  assignProvider,
  setBookingStatus,
  readBookingActivity,
  deleteBookingsByIds,
  sweepCertificationBookings,
} from '../support/connected/qa-bookings';

/**
 * Launch Certification — Admin dispatch (QA Slice 44A, Milestone 4).
 *
 * Certifies the admin dispatch lifecycle against the real QA backend using the
 * same PostgREST path the app uses (assignProvider / updateBookingStatus): queue
 * visibility, assign → reassign, provider access transfer (RLS), admin status
 * transitions (accept / reject), invalid-value rejection, and app-created audit
 * rows in booking_activity. Real bookings, deterministic cleanup (service-role,
 * cascades booking_activity + notifications). Serial + session-cached.
 *
 * Schema note: `bookings` has NO `updated_at` column — change history is recorded
 * in `booking_activity` (asserted below), so audit consistency is verified there.
 */
const PROVIDER1_INFO = { name: 'QA Provider One', phone: '+254700000001' };
const PROVIDER2_INFO = { name: 'QA Provider Two', phone: '+254700000002' };

test.describe('Launch Certification — Admin dispatch', { tag: ['@certification', '@connected'] }, () => {
  const createdIds: string[] = [];

  test.beforeEach(({}, testInfo) => {
    test.skip(!certificationConfigured(), certificationSkipReason());
    test.skip(!hasServiceRole(), 'Cleanup requires QA_SERVICE_ROLE_KEY.');
    test.skip(testInfo.project.name !== 'chromium', 'Launch Certification is Chromium-only.');
    createdIds.length = 0;
  });

  test.afterEach(async () => {
    await deleteBookingsByIds(createdIds); // cascades booking_activity + notifications
    createdIds.length = 0;
  });

  test.afterAll(async () => {
    if (certificationConfigured() && hasServiceRole()) await sweepCertificationBookings();
  });

  test(
    'admin queue → assign P1 → reassign P2, with provider access transfer (RLS)',
    { tag: ['@p0', '@security'] },
    async () => {
      const { ctx: customer, userId: customerId } = await authedContextWithUser('customer');
      const { ctx: p1, userId: p1Id } = await authedContextWithUser('provider1');
      const { ctx: p2, userId: p2Id } = await authedContextWithUser('provider2');
      const admin = await authedContext('admin');
      let anon: APIRequestContext | undefined;
      try {
        // Customer creates a booking → it appears in the admin queue.
        const created = await createCustomerBooking(customer, customerId);
        createdIds.push(created.id);
        const queued = await readBookingById(admin, created.id);
        expect(queued, 'booking visible in admin queue').toHaveLength(1);
        expect(queued[0].status).toBe('pending');

        // Admin assigns Provider 1 — DB reflects immediately.
        const assigned1 = await assignProvider(admin, created.id, { providerId: p1Id, ...PROVIDER1_INFO });
        expect(assigned1.status).toBe('provider_assigned');
        expect(assigned1.assigned_provider_id).toBe(p1Id);
        expect(assigned1.assigned_provider_name).toBe(PROVIDER1_INFO.name);
        expect(assigned1.assigned_provider_phone).toBe(PROVIDER1_INFO.phone);
        const afterAssign = await readBookingById(admin, created.id);
        expect(afterAssign[0].assigned_provider_id).toBe(p1Id);

        // RLS after assignment: P1 sees it, P2 does not, customer sees it, anon does not.
        expect(await readBookingById(p1, created.id), 'P1 sees assigned booking').toHaveLength(1);
        expect(await readBookingById(p2, created.id), 'P2 cannot see it').toHaveLength(0);
        expect(await readBookingById(customer, created.id), 'customer still sees own').toHaveLength(1);
        anon = await anonContext();
        expect(await readBookingById(anon, created.id), 'anon cannot see it').toHaveLength(0);

        // Admin reassigns to Provider 2.
        const assigned2 = await assignProvider(admin, created.id, { providerId: p2Id, ...PROVIDER2_INFO });
        expect(assigned2.assigned_provider_id).toBe(p2Id);

        // Access transfer: P2 gains access, P1 IMMEDIATELY loses it, admin still sees it.
        expect(await readBookingById(p2, created.id), 'P2 now sees it').toHaveLength(1);
        expect(await readBookingById(p1, created.id), 'P1 lost access after reassign').toHaveLength(0);
        expect(await readBookingById(admin, created.id), 'admin still sees it').toHaveLength(1);

        // Audit: app created booking_activity rows for the status transitions.
        const activity = await readBookingActivity(admin, created.id);
        expect(activity.length, 'audit rows exist for dispatch').toBeGreaterThan(0);
      } finally {
        await customer.dispose();
        await p1.dispose();
        await p2.dispose();
        await admin.dispose();
        await anon?.dispose();
      }
    },
  );

  test('admin accepts a booking (pending → accepted) and audit is recorded', { tag: ['@p0'] }, async () => {
    const { ctx: customer, userId } = await authedContextWithUser('customer');
    const admin = await authedContext('admin');
    try {
      const created = await createCustomerBooking(customer, userId);
      createdIds.push(created.id);

      const res = await setBookingStatus(admin, created.id, 'accepted');
      expect(res.status).toBe(200);
      expect(res.row?.status).toBe('accepted');
      expect((await readBookingById(admin, created.id))[0].status).toBe('accepted');

      const activity = await readBookingActivity(admin, created.id);
      expect(activity.some((a) => a.event_type)).toBe(true);
    } finally {
      await customer.dispose();
      await admin.dispose();
    }
  });

  test('admin rejects a booking (pending → cancelled)', { tag: ['@p0'] }, async () => {
    const { ctx: customer, userId } = await authedContextWithUser('customer');
    const admin = await authedContext('admin');
    try {
      const created = await createCustomerBooking(customer, userId);
      createdIds.push(created.id);

      const res = await setBookingStatus(admin, created.id, 'cancelled');
      expect(res.status).toBe(200);
      expect(res.row?.status).toBe('cancelled');
      expect((await readBookingById(admin, created.id))[0].status).toBe('cancelled');
    } finally {
      await customer.dispose();
      await admin.dispose();
    }
  });

  test('an invalid status value is rejected and the booking is unchanged', { tag: ['@p0', '@security'] }, async () => {
    const { ctx: customer, userId } = await authedContextWithUser('customer');
    const admin = await authedContext('admin');
    try {
      const created = await createCustomerBooking(customer, userId);
      createdIds.push(created.id);

      const res = await setBookingStatus(admin, created.id, 'not_a_status');
      expect(res.status, 'DB check-constraint rejects invalid status').toBeGreaterThanOrEqual(400);
      // Booking remains in its valid initial state.
      expect((await readBookingById(admin, created.id))[0].status).toBe('pending');
    } finally {
      await customer.dispose();
      await admin.dispose();
    }
  });
});
