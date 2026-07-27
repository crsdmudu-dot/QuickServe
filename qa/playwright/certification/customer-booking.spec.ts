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
  deleteBookingsByIds,
  sweepCertificationBookings,
} from '../support/connected/qa-bookings';

/**
 * Launch Certification — Customer booking (QA Slice 44A, Milestone 3).
 *
 * Proves REAL booking persistence + tenant isolation against the dedicated QA
 * backend using the four persistent QA accounts. A booking is created via the
 * same PostgREST path the app's `createBooking` uses, read back from the DB, and
 * checked for RLS isolation (anon / non-owner / admin). Every created booking is
 * deleted in afterEach (even on failure) and an afterAll sweep guarantees a clean
 * DB across repeated runs. Service-role is used ONLY for teardown, never to assert.
 *
 * Note on accounts: only one customer account is provisioned (Decision B), so the
 * "another authenticated user cannot see it" check uses provider2 — a non-owner,
 * non-admin, non-assigned user — which is the RLS-meaningful negative.
 */
test.describe('Launch Certification — Customer booking', { tag: ['@certification', '@connected'] }, () => {
  const createdIds: string[] = [];

  test.beforeEach(({}, testInfo) => {
    test.skip(!certificationConfigured(), certificationSkipReason());
    test.skip(!hasServiceRole(), 'Cleanup requires QA_SERVICE_ROLE_KEY (bookings has no DELETE RLS policy).');
    test.skip(testInfo.project.name !== 'chromium', 'Launch Certification is Chromium-only.');
    createdIds.length = 0;
  });

  // Deterministic teardown — runs even when assertions fail.
  test.afterEach(async () => {
    await deleteBookingsByIds(createdIds);
    createdIds.length = 0;
  });

  test.afterAll(async () => {
    if (certificationConfigured() && hasServiceRole()) await sweepCertificationBookings();
  });

  test(
    'a customer booking persists with the correct initial state and required fields',
    { tag: ['@p0'] },
    async () => {
      const { ctx: customer, userId } = await authedContextWithUser('customer');
      try {
        const created = await createCustomerBooking(customer, userId);
        createdIds.push(created.id);

        // Persistence: read the row back FROM THE DB (not the insert echo).
        const rows = await readBookingById(customer, created.id);
        expect(rows).toHaveLength(1);
        const row = rows[0];

        // Required fields + correct initial state.
        expect(row.id).toBe(created.id);
        expect(row.customer_id).toBe(userId);
        expect(row.service_id).toBe('house-cleaning');
        expect(row.address).toBe('QA Certification Address, Nairobi');
        // Round-trip: the persisted slot matches exactly what was submitted.
        expect(row.scheduled_for).toBe(created.row.scheduled_for);
        expect(Number.isNaN(Date.parse(row.scheduled_for as string))).toBe(false);
        expect(row.notes).toBe(created.marker);
        expect(row.status).toBe('pending'); // initial lifecycle state
        expect(row.assigned_provider_id).toBeNull(); // unassigned at creation
        expect(row.scheduling_type).toBe('datetime');
        expect(row.recurrence).toBe('one_time');
        expect(typeof row.created_at).toBe('string');
        expect(String(row.id)).toMatch(/^[0-9a-f-]{36}$/i); // uuid shape
      } finally {
        await customer.dispose();
      }
    },
  );

  test(
    'a booking is visible only to its owner and admin (tenant isolation)',
    { tag: ['@p0', '@security'] },
    async () => {
      const { ctx: customer, userId } = await authedContextWithUser('customer');
      let anon: APIRequestContext | undefined;
      let nonOwner: APIRequestContext | undefined;
      let admin: APIRequestContext | undefined;
      try {
        const created = await createCustomerBooking(customer, userId);
        createdIds.push(created.id);

        // Owner sees it.
        expect(await readBookingById(customer, created.id)).toHaveLength(1);

        // Anonymous cannot see it.
        anon = await anonContext();
        expect(await readBookingById(anon, created.id)).toHaveLength(0);

        // Another authenticated non-owner (provider2, not assigned) cannot see it.
        nonOwner = await authedContext('provider2');
        expect(await readBookingById(nonOwner, created.id)).toHaveLength(0);

        // Admin can see it (RLS admin policy).
        admin = await authedContext('admin');
        const adminRows = await readBookingById(admin, created.id);
        expect(adminRows).toHaveLength(1);
        expect(adminRows[0].id).toBe(created.id);
      } finally {
        await customer.dispose();
        await anon?.dispose();
        await nonOwner?.dispose();
        await admin?.dispose();
      }
    },
  );
});
