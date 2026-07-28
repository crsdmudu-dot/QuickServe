import { test, expect } from '@playwright/test';
import {
  certificationConfigured,
  certificationSkipReason,
  qaAccount,
} from '../support/connected/qa-accounts';
import { anonContext, authedContextWithUser } from '../support/connected/qa-client';
import {
  passwordGrantFresh,
  passwordGrantRaw,
  refreshGrantRaw,
  logout,
  invalidTokenContext,
} from '../support/connected/qa-auth';

/**
 * Phase 1B — Authentication lifecycle (CONNECTED).
 *
 * Exercises the real Supabase Auth + PostgREST of the dedicated QA project:
 * login (password grant), refresh, logout/revocation, invalid-session rejection,
 * role/tenant enforcement, and unauthorized-write denial. Read-only + auth-token
 * lifecycle — creates no persistent rows, so no cleanup is required. Chromium-only,
 * gated on certificationConfigured() (never targets production).
 */
test.describe('Phase 1B — Auth lifecycle', { tag: ['@certification', '@connected'] }, () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(!certificationConfigured(), certificationSkipReason());
    test.skip(testInfo.project.name !== 'chromium', 'Connected coverage is Chromium-only.');
  });

  test('login: password grant returns an access + refresh token', { tag: ['@p0'] }, async () => {
    const tokens = await passwordGrantFresh('customer');
    expect(tokens.accessToken.length, 'access token').toBeGreaterThan(20);
    expect(tokens.refreshToken.length, 'refresh token').toBeGreaterThan(10);
    expect(tokens.userId, 'user id').toBeTruthy();
  });

  test('login negative: a wrong password is rejected', { tag: ['@p0', '@security'] }, async () => {
    const acct = qaAccount('customer')!;
    const r = await passwordGrantRaw(acct.email, `${acct.password}-definitely-wrong`);
    expect(r.status, 'wrong password must not authenticate').not.toBe(200);
    expect(r.body.access_token, 'no token issued').toBeFalsy();
  });

  test('refresh: a refresh token exchanges for a new access token', { tag: ['@p0'] }, async () => {
    const tokens = await passwordGrantFresh('provider1');
    const r = await refreshGrantRaw(tokens.refreshToken);
    expect(r.status, 'refresh grant').toBe(200);
    expect(r.body.access_token, 'refreshed access token').toBeTruthy();
  });

  test('logout: revokes the session so its refresh token no longer works', { tag: ['@p0', '@security'] }, async () => {
    const tokens = await passwordGrantFresh('provider2');
    // Sanity: the refresh token works before logout.
    expect((await refreshGrantRaw(tokens.refreshToken)).status).toBe(200);
    // Logout revokes the session's refresh tokens.
    const status = await logout(tokens.accessToken);
    expect([200, 204], 'logout accepted').toContain(status);
    const after = await refreshGrantRaw(tokens.refreshToken);
    expect(after.status, 'refresh after logout must be rejected').not.toBe(200);
  });

  test('expired/invalid session: a bogus bearer token is rejected by the API', { tag: ['@p0', '@security'] }, async () => {
    const ctx = await invalidTokenContext();
    try {
      const res = await ctx.get('/rest/v1/bookings?select=id&limit=1');
      expect(res.status(), 'invalid token → 401').toBe(401);
    } finally {
      await ctx.dispose();
    }
  });

  test('role/tenant enforcement: a customer reads only their own profile', { tag: ['@p0', '@security'] }, async () => {
    const { ctx, userId } = await authedContextWithUser('customer');
    try {
      const res = await ctx.get('/rest/v1/profiles?select=id');
      expect(res.status()).toBe(200);
      const rows = (await res.json()) as { id: string }[];
      // profiles_select_own: RLS scopes every read to the caller's own row.
      expect(rows.length, 'exactly one profile visible').toBe(1);
      expect(rows[0].id, 'and it is the caller').toBe(userId);
    } finally {
      await ctx.dispose();
    }
  });

  test('unauthorized: an anonymous caller cannot create a booking', { tag: ['@p0', '@security'] }, async () => {
    const ctx = await anonContext();
    try {
      const res = await ctx.post('/rest/v1/bookings', {
        headers: { 'Content-Type': 'application/json' },
        data: { service_id: 'house-cleaning', address: 'x', scheduled_for: new Date().toISOString() },
      });
      // No auth.uid() → RLS insert (customer_id = auth.uid()) can never be satisfied.
      expect([401, 403], 'anon write denied').toContain(res.status());
    } finally {
      await ctx.dispose();
    }
  });
});
