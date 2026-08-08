import { test, expect, request } from '@playwright/test';

/**
 * Phase 4D P1 regression (connected) — public.apply_mpesa_callback must be
 * SERVICE-ROLE ONLY. A direct PostgREST RPC call with the public anon key (or an
 * authenticated user JWT) must be DENIED after migration 0035.
 *
 * Baseline bug (migration 0012 only): EXECUTE was revoked from anon/authenticated
 * but NOT from PUBLIC, so anon retained EXECUTE via PUBLIC and could settle a payment
 * (pending -> paid) directly through /rest/v1/rpc/apply_mpesa_callback, bypassing the
 * mpesa-callback Edge Function's token gate. Post-0035 this path is closed.
 *
 * This test exercises the RPC directly (no fixture, no mutation — a denied call never
 * reaches the function body) and asserts denial. It is a CONNECTED test (real QA
 * backend); it is skipped when QA_SUPABASE_URL / QA_SUPABASE_ANON_KEY are absent and is
 * not part of the offline PR CI suite.
 */
const BASE = () => process.env.QA_SUPABASE_URL?.replace(/\/+$/, '');
const ANON = () => process.env.QA_SUPABASE_ANON_KEY;

test.describe('Phase 4D — apply_mpesa_callback RPC is service-role-only', () => {
  test.skip(!BASE() || !ANON(), 'QA_SUPABASE_URL / QA_SUPABASE_ANON_KEY not configured');

  test('anon direct REST RPC call is denied (token-gate bypass closed)', async () => {
    const ctx = await request.newContext();
    const res = await ctx.post(`${BASE()}/rest/v1/rpc/apply_mpesa_callback`, {
      headers: { apikey: ANON() as string, Authorization: `Bearer ${ANON()}`, 'Content-Type': 'application/json' },
      data: { p_checkout_request_id: 'ws_CO_regression_probe', p_merchant_request_id: 'x', p_result_code: 0, p_result_desc: 'x', p_raw: {} },
    });
    // PostgREST returns 401/403/404 when EXECUTE is not granted to the caller's role.
    expect([401, 403, 404]).toContain(res.status());
    await ctx.dispose();
  });
});
