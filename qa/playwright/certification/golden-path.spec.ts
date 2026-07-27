import { test, expect } from '@playwright/test';
import { certificationConfigured, certificationSkipReason } from '../support/connected/qa-accounts';
import {
  anonContext,
  authedContext,
  authedContextWithUser,
  hasServiceRole,
} from '../support/connected/qa-client';
import {
  createCustomerBooking,
  assignProvider,
  setBookingStatus,
  readBookingById,
  readBookingActivity,
  readBookingNotifications,
  deleteBookingsByIds,
  sweepCertificationBookings,
} from '../support/connected/qa-bookings';

/**
 * Launch Certification — Golden path (QA Slice 44A, Milestone 6).
 *
 * The complete QuickServe business transaction as ONE continuous certification
 * test against the real QA backend, composing the previously-certified building
 * blocks (customer create → admin assign → provider progress → customer sees
 * completed). After every major step it verifies persisted state, booking_activity,
 * notifications, RLS visibility for all five actors, ownership, and status
 * consistency; and at the end verifies exact audit ordering + monotonic timestamps.
 * Real authenticated API only; service-role reserved for teardown.
 */
const P1 = { name: 'QA Provider One', phone: '+254700000001' };
const EXPECTED_AUDIT = ['booking_created', 'provider_assigned', 'on_the_way', 'in_progress', 'completed'];

test.describe('Launch Certification — Golden path', { tag: ['@certification', '@connected', '@golden-path'] }, () => {
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
    'end-to-end: customer books → admin assigns → provider completes → all roles consistent',
    { tag: ['@p0', '@security'] },
    async () => {
      const { ctx: customer, userId: customerId } = await authedContextWithUser('customer');
      const { ctx: p1, userId: p1Id } = await authedContextWithUser('provider1');
      const p2 = await authedContext('provider2');
      const admin = await authedContext('admin');
      const anon = await anonContext();
      try {
        // ── Step 1 — Customer creates the booking ─────────────────────────────
        const created = await createCustomerBooking(customer, customerId);
        createdIds.push(created.id);

        let rows = await readBookingById(customer, created.id);
        expect(rows, 'owner sees own booking').toHaveLength(1);
        expect(rows[0].status).toBe('pending');
        expect(rows[0].customer_id).toBe(customerId);
        expect(rows[0].assigned_provider_id).toBeNull();
        const createdAt = rows[0].created_at as string; // pin: must never move

        // RLS: admin queue shows it; providers + anon do not.
        expect(await readBookingById(admin, created.id), 'in admin queue').toHaveLength(1);
        expect(await readBookingById(p1, created.id)).toHaveLength(0);
        expect(await readBookingById(p2, created.id)).toHaveLength(0);
        expect(await readBookingById(anon, created.id)).toHaveLength(0);
        expect((await readBookingActivity(admin, created.id)).map((a) => a.event_type)).toEqual([
          'booking_created',
        ]);

        // ── Step 2 — Admin assigns Provider 1 ─────────────────────────────────
        const assigned = await assignProvider(admin, created.id, { providerId: p1Id, ...P1 });
        expect(assigned.status).toBe('provider_assigned');
        expect(assigned.assigned_provider_id).toBe(p1Id);

        rows = await readBookingById(admin, created.id);
        expect(rows[0].status).toBe('provider_assigned');
        expect(rows[0].assigned_provider_id).toBe(p1Id);

        // RLS: P1 now sees it; P2 still cannot; customer keeps ownership; anon none.
        expect(await readBookingById(p1, created.id), 'assigned provider sees it').toHaveLength(1);
        expect(await readBookingById(p2, created.id), 'unassigned provider blind').toHaveLength(0);
        expect(await readBookingById(customer, created.id)).toHaveLength(1);
        expect(await readBookingById(anon, created.id)).toHaveLength(0);
        expect((await readBookingActivity(admin, created.id)).map((a) => a.event_type)).toEqual([
          'booking_created',
          'provider_assigned',
        ]);

        // ── Step 3 — Provider progresses to completed ─────────────────────────
        for (const next of ['on_the_way', 'in_progress', 'completed'] as const) {
          const r = await setBookingStatus(p1, created.id, next);
          expect(r.changed, `provider advances to ${next}`).toBe(true);
          expect(r.row?.status).toBe(next);
          expect(r.row?.assigned_provider_id, 'assignment unchanged during progression').toBe(p1Id);

          expect((await readBookingById(p1, created.id))[0].status).toBe(next);
          // Unassigned provider + anon never gain visibility mid-flight.
          expect(await readBookingById(p2, created.id)).toHaveLength(0);
          expect(await readBookingById(anon, created.id)).toHaveLength(0);
        }

        // ── Step 4 — Customer sees the completed booking ──────────────────────
        rows = await readBookingById(customer, created.id);
        expect(rows, 'customer still owns it').toHaveLength(1);
        expect(rows[0].status).toBe('completed');
        expect(rows[0].assigned_provider_id).toBe(p1Id);
        expect(rows[0].customer_id).toBe(customerId);
        expect(rows[0].created_at, 'created_at never moves').toBe(createdAt);
        expect(await readBookingById(admin, created.id), 'admin still sees completed booking').toHaveLength(1);

        // ── Audit trail: exact ordering matches the workflow + monotonic time ──
        const activity = await readBookingActivity(admin, created.id);
        expect(activity.map((a) => a.event_type)).toEqual(EXPECTED_AUDIT);
        const ts = activity.map((a) => Date.parse(a.created_at as string));
        for (let i = 1; i < ts.length; i++) {
          expect(ts[i], 'audit timestamps never move backwards').toBeGreaterThanOrEqual(ts[i - 1]);
        }

        // ── Notifications consistent with the workflow (RLS-scoped) ───────────
        const custNotif = await readBookingNotifications(customer, created.id);
        expect(custNotif.length, 'customer notified through the journey').toBeGreaterThan(0);
        expect(
          custNotif.every((n) => n.user_id === customerId),
          'customer only sees own notifications',
        ).toBe(true);
        expect(
          custNotif.some((n) => /complet/i.test(String(n.type))),
          'completion propagated to the customer',
        ).toBe(true);
        expect((await readBookingNotifications(p1, created.id)).length, 'assigned provider notified').toBeGreaterThan(0);
        expect(await readBookingNotifications(p2, created.id), 'unassigned provider gets none').toHaveLength(0);
        expect(await readBookingNotifications(anon, created.id), 'anon gets none').toHaveLength(0);

        // ── Negative guardrails held throughout: unassigned/anon never wrote ──
        expect((await setBookingStatus(p2, created.id, 'in_progress')).changed, 'P2 never had write access').toBe(false);
        expect((await setBookingStatus(anon, created.id, 'on_the_way')).changed, 'anon never had write access').toBe(false);
        expect((await readBookingById(admin, created.id))[0].status, 'booking unchanged by denied writes').toBe('completed');
      } finally {
        await customer.dispose();
        await p1.dispose();
        await p2.dispose();
        await admin.dispose();
        await anon.dispose();
      }
    },
  );
});
