import { test, expect, request } from '@playwright/test';

/**
 * Phase 4D.2 regression (connected) — public.reconcile_stale_payment_attempts must be
 * SERVICE-ROLE ONLY. A direct PostgREST RPC call with the public anon key must be DENIED
 * (migration 0036 revokes EXECUTE from public/anon/authenticated, grants only service_role).
 *
 * The reconcile only marks stale attempts 'timed_out' and never settles payments, but it
 * must still not be publicly callable. This exercises the RPC directly and asserts denial.
 * CONNECTED test (real QA backend); skipped without QA_SUPABASE_URL / QA_SUPABASE_ANON_KEY;
 * not part of the offline PR CI suite.
 */
const BASE = () => process.env.QA_SUPABASE_URL?.replace(/\/+$/, '');
const ANON = () => process.env.QA_SUPABASE_ANON_KEY;

test.describe('Phase 4D.2 — reconcile_stale_payment_attempts RPC is service-role-only', () => {
  test.skip(!BASE() || !ANON(), 'QA_SUPABASE_URL / QA_SUPABASE_ANON_KEY not configured');

  test('anon direct REST RPC call is denied', async () => {
    const ctx = await request.newContext();
    const res = await ctx.post(`${BASE()}/rest/v1/rpc/reconcile_stale_payment_attempts`, {
      headers: { apikey: ANON() as string, Authorization: `Bearer ${ANON()}`, 'Content-Type': 'application/json' },
      data: { p_max_age: '00:05:00' },
    });
    expect([401, 403, 404]).toContain(res.status());
    await ctx.dispose();
  });
});
