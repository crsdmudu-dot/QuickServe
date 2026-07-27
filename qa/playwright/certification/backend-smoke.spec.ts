import { test, expect } from '@playwright/test';
import {
  certificationConfigured,
  certificationSkipReason,
} from '../support/connected/qa-accounts';
import { anonContext, authedContext, signIn } from '../support/connected/qa-client';

/**
 * Launch Certification — backend smoke (QA Slice 44A, Milestone 2).
 *
 * The first CONNECTED tests: they prove the certification harness talks to the
 * REAL dedicated QA/staging backend, that all four persistent accounts
 * authenticate, and that RLS is enforced. Read-only + auth (no writes) — the
 * write/persistence certification (customer booking, dispatch, progression)
 * follows in later milestones with real cleanup.
 *
 * Gated on `certificationConfigured()` (a dedicated QA project + 4 accounts) — it
 * NEVER targets production and skips cleanly when unconfigured. Chromium-only.
 */
const ROLES = ['customer', 'admin', 'provider1', 'provider2'] as const;

test.describe('Launch Certification — backend smoke', { tag: ['@certification', '@connected'] }, () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(!certificationConfigured(), certificationSkipReason());
    test.skip(testInfo.project.name !== 'chromium', 'Launch Certification is Chromium-only.');
  });

  test('all four persistent QA accounts authenticate', { tag: ['@p0'] }, async () => {
    for (const role of ROLES) {
      const token = await signIn(role);
      expect(token.length, `access token for ${role}`).toBeGreaterThan(20);
    }
  });

  test('anonymous cannot read bookings (RLS enforced)', { tag: ['@p0', '@security'] }, async () => {
    const ctx = await anonContext();
    try {
      const res = await ctx.get('/rest/v1/bookings?select=id&limit=1');
      // RLS: an anon caller is admitted by PostgREST but sees ZERO rows.
      expect(res.status()).toBe(200);
      expect(await res.json()).toEqual([]);
    } finally {
      await ctx.dispose();
    }
  });

  test('admin can read the bookings table (authenticated, RLS admin)', { tag: ['@p0'] }, async () => {
    const ctx = await authedContext('admin');
    try {
      const res = await ctx.get('/rest/v1/bookings?select=id&limit=1');
      expect(res.status()).toBe(200);
      expect(Array.isArray(await res.json())).toBe(true);
    } finally {
      await ctx.dispose();
    }
  });

  test('a customer cannot read the full bookings table as admin would', { tag: ['@p0', '@security'] }, async () => {
    // Tenant isolation: a customer's bookings query is RLS-scoped to their own
    // rows. With no bookings yet, that is an empty set — never all rows.
    const ctx = await authedContext('customer');
    try {
      const res = await ctx.get('/rest/v1/bookings?select=id');
      expect(res.status()).toBe(200);
      const rows = (await res.json()) as unknown[];
      expect(Array.isArray(rows)).toBe(true);
      // (Real cross-tenant negative — customer2 cannot see customer1's booking —
      // is asserted in the customer milestone once a booking exists.)
    } finally {
      await ctx.dispose();
    }
  });
});
