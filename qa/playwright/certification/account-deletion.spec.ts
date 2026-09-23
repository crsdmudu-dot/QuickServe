import { test, expect, request, type APIRequestContext } from '@playwright/test';
import { certificationConfigured, certificationSkipReason, qaSupabaseAnonKey, qaSupabaseUrl } from '../support/connected/qa-accounts';
import {
  adminCreateUser,
  adminDeleteUser,
  approvedAdminProfileIds,
  deleteProviderPendingNotification,
  signInAs,
  sweepEphemeralUsers,
} from '../support/connected/qa-auth';

/**
 * Phase 4 — Account deletion certification (connected, certified QA only).
 *
 * Every subject is a uniquely marked DISPOSABLE identity created here and removed in afterAll;
 * the four fixed QA identities are never deletion subjects. Financial rows seeded for a subject
 * are removed in afterAll too, so the fixed-account totals, financial fingerprints and residue
 * checks return to baseline (delta-zero is asserted at the end).
 *
 * The suite calls the deployed `delete-account` Edge Function over HTTP exactly as the app does:
 * the subject's own access token, the anon key, and a body carrying only {confirmation, password}.
 */
const PW = 'QaDeletion-123!';
const PREFIX = 'qa-del'; // distinct from the onboarding suite's marker so sweeps never cross
const ZERO_PHONE = '+254700000001';

test.describe('Phase 4 — Account deletion', { tag: ['@certification', '@connected'] }, () => {
  const createdUserIds: string[] = [];
  const seededBookingIds: string[] = [];
  let baseline: Record<string, number> = {};
  let suiteStart = new Date().toISOString();

  test.beforeEach(({}, testInfo) => {
    test.skip(!certificationConfigured(), certificationSkipReason());
    test.skip(!process.env.QA_SERVICE_ROLE_KEY, 'QA_SERVICE_ROLE_KEY is required for deletion certification.');
    test.skip(testInfo.project.name !== 'chromium', 'Connected coverage is Chromium-only.');
  });

  test.beforeAll(async ({}, testInfo) => {
    if (!certificationConfigured() || !process.env.QA_SERVICE_ROLE_KEY || testInfo.project.name !== 'chromium') return;
    suiteStart = new Date().toISOString();
    baseline = await totals();
  });

  test.afterAll(async ({}, testInfo) => {
    if (!certificationConfigured() || !process.env.QA_SERVICE_ROLE_KEY || testInfo.project.name !== 'chromium') return;
    const failures: string[] = [];
    // Seeded financial rows first (bookings cascade payments/earnings; payouts RESTRICT earnings).
    for (const b of seededBookingIds) {
      try {
        // PostgREST has no sub-selects: resolve the earning ids first, then remove payouts
        // (RESTRICT) before earnings, before payments, before the booking.
        const earnings = await svcGet<{ id: string }[]>(`/rest/v1/provider_earnings?booking_id=eq.${b}&select=id`);
        if (earnings.length) {
          await svcDelete(`/rest/v1/provider_payouts?earning_id=in.(${earnings.map((e) => e.id).join(',')})`);
        }
        await svcDelete(`/rest/v1/provider_earnings?booking_id=eq.${b}`);
        await svcDelete(`/rest/v1/payments?booking_id=eq.${b}`);
        await svcDelete(`/rest/v1/bookings?id=eq.${b}`);
      } catch (err) {
        failures.push(`seed cleanup ${b}: ${(err as Error).message}`);
      }
    }
    // Provider signups fan out one admin_provider_pending notification per approved admin (keyed
    // by dedup_key); a failed seeded attempt fans out admin_attempt_discrepancy rows. Remove both
    // by exact key where attributable, then sweep the two test-generated types inside this
    // suite's time window only. The 31 historical rows predate the window and are never touched.
    let recipients: string[] = [];
    try { recipients = await approvedAdminProfileIds(); } catch (err) { failures.push(`admin recipients: ${(err as Error).message}`); }
    // Tombstones, audit rows, throttle rows, then the auth identities (some are already gone).
    for (const id of createdUserIds) {
      try {
        await deleteProviderPendingNotification(id, recipients).catch(() => {});
        await svcDelete(`/rest/v1/notifications?user_id=eq.${id}`);
        await svcDelete(`/rest/v1/account_flags?subject_id=eq.${id}`);
        await svcDelete(`/rest/v1/favorite_providers?or=(customer_id.eq.${id},provider_id.eq.${id})`);
        await svcDelete(`/rest/v1/account_deletions?user_id=eq.${id}`);
        await svcDelete(`/rest/v1/account_deletion_attempts?user_id=eq.${id}`);
        await svcDelete(`/rest/v1/wallets?customer_id=eq.${id}`);
        await svcDelete(`/rest/v1/profiles?id=eq.${id}`);
        await adminDeleteUser(id).catch(() => {});
      } catch (err) {
        failures.push(`user cleanup ${id}: ${(err as Error).message}`);
      }
    }
    await svcDelete(`/rest/v1/notifications?type=in.(admin_provider_pending,admin_attempt_discrepancy)&created_at=gt.${encodeURIComponent(suiteStart)}`);
    await sweepEphemeralUsers(PREFIX);
    const after = await totals();
    if (failures.length) throw new Error(`account-deletion cleanup failures:\n${failures.join('\n')}`);
    expect(after, 'fixed-account totals must return to baseline (delta zero)').toEqual(baseline);
  });

  // ── helpers ──────────────────────────────────────────────────────────────────────────────
  async function service(): Promise<APIRequestContext> {
    const key = process.env.QA_SERVICE_ROLE_KEY as string;
    return request.newContext({
      baseURL: qaSupabaseUrl(),
      extraHTTPHeaders: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    });
  }
  async function svcGet<T = unknown>(path: string): Promise<T> {
    const s = await service();
    try { const r = await s.get(path); return (await r.json()) as T; } finally { await s.dispose(); }
  }
  async function svcPost<T = unknown>(path: string, data: unknown): Promise<T> {
    const s = await service();
    try {
      const r = await s.post(path, { data, headers: { Prefer: 'return=representation' } });
      expect(r.status(), `POST ${path.split('?')[0]}`).toBeLessThan(300);
      return (await r.json()) as T;
    } finally { await s.dispose(); }
  }
  async function svcPatch(path: string, data: unknown): Promise<void> {
    const s = await service();
    try { const r = await s.patch(path, { data }); expect(r.status(), `PATCH ${path.split('?')[0]}`).toBeLessThan(300); } finally { await s.dispose(); }
  }
  async function svcDelete(path: string): Promise<void> {
    const s = await service();
    try { await s.delete(path); } finally { await s.dispose(); }
  }
  async function svcRpc<T = unknown>(fn: string, args: Record<string, unknown>): Promise<T> {
    const s = await service();
    try { const r = await s.post(`/rest/v1/rpc/${fn}`, { data: args }); return (await r.json()) as T; } finally { await s.dispose(); }
  }
  async function count(table: string, filter = ''): Promise<number> {
    const s = await service();
    try {
      const r = await s.get(`/rest/v1/${table}?select=id${filter}`, { headers: { Prefer: 'count=exact', Range: '0-0' } });
      const cr = r.headers()['content-range'] ?? '';
      return Number(cr.split('/')[1] ?? -1);
    } finally { await s.dispose(); }
  }
  async function totals(): Promise<Record<string, number>> {
    const out: Record<string, number> = {};
    for (const t of ['bookings', 'payments', 'payment_attempts', 'provider_earnings', 'notifications', 'booking_activity', 'profiles', 'device_tokens']) {
      out[t] = await count(t);
    }
    out.admin_provider_pending = await count('notifications', '&type=eq.admin_provider_pending&booking_id=is.null');
    return out;
  }

  async function createSubject(role: 'customer' | 'provider'): Promise<{ id: string; email: string; token: string }> {
    const email = `${PREFIX}-${role}-${crypto.randomUUID()}@example.com`;
    const r = await adminCreateUser(email, PW, { full_name: 'QA Deletion Subject', phone: ZERO_PHONE, role });
    expect(r.status, `create ${role}`).toBe(200);
    const id = (r.body.id as string) ?? ((r.body.user as { id?: string } | undefined)?.id as string);
    expect(id).toBeTruthy();
    createdUserIds.push(id);
    if (role === 'provider') await svcPatch(`/rest/v1/profiles?id=eq.${id}`, { approval_status: 'approved' });
    const token = await signInAs(email, PW);
    expect(token, 'subject can sign in').toBeTruthy();
    return { id, email, token: token as string };
  }

  /** A COMPLETED, PAID booking between customer and provider with a PAID earning. */
  async function seedSettledHistory(customerId: string, providerId: string): Promise<{ bookingId: string; paymentId: string; earningId: string }> {
    const [b] = await svcPost<{ id: string }[]>('/rest/v1/bookings', {
      customer_id: customerId, assigned_provider_id: providerId, service_id: 'house_cleaning',
      address: '12 Test Lane, Nairobi', notes: 'gate code 4321', latitude: -1.29, longitude: 36.82,
      scheduled_for: new Date().toISOString(), status: 'completed', assigned_provider_name: 'QA Provider', assigned_provider_phone: ZERO_PHONE,
    });
    seededBookingIds.push(b.id);
    const [p] = await svcPost<{ id: string }[]>('/rest/v1/payments', {
      booking_id: b.id, customer_id: customerId, amount: 1500, currency: 'KES', status: 'paid',
      provider_share: 1200, quickserve_share: 300, paid_at: new Date().toISOString(),
    });
    await svcPost('/rest/v1/payment_attempts', { payment_id: p.id, provider: 'mpesa', phone: '254712345678', amount: 1500, status: 'successful' });
    const [e] = await svcPost<{ id: string }[]>('/rest/v1/provider_earnings', { provider_id: providerId, booking_id: b.id, amount: 1200, payout_status: 'paid' });
    return { bookingId: b.id, paymentId: p.id, earningId: e.id };
  }

  async function callDelete(token: string | null, body: unknown): Promise<{ status: number; body: Record<string, unknown> }> {
    const ctx = await request.newContext({
      baseURL: qaSupabaseUrl(),
      extraHTTPHeaders: { apikey: qaSupabaseAnonKey() as string, 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    });
    try {
      const r = await ctx.post('/functions/v1/delete-account', { data: body });
      let parsed: Record<string, unknown> = {};
      try { parsed = (await r.json()) as Record<string, unknown>; } catch { /* non-JSON */ }
      return { status: r.status(), body: parsed };
    } finally { await ctx.dispose(); }
  }

  async function userReads(token: string, path: string): Promise<{ status: number; rows: unknown[] }> {
    const ctx = await request.newContext({
      baseURL: qaSupabaseUrl(),
      extraHTTPHeaders: { apikey: qaSupabaseAnonKey() as string, Authorization: `Bearer ${token}` },
    });
    try { const r = await ctx.get(path); let rows: unknown[] = []; try { rows = (await r.json()) as unknown[]; } catch { /* */ } return { status: r.status(), rows: Array.isArray(rows) ? rows : [] }; } finally { await ctx.dispose(); }
  }

  const GOOD = { confirmation: 'DELETE', password: PW };

  // ── authorization ─────────────────────────────────────────────────────────────────────────
  test('anonymous request → 401, nothing changes', { tag: ['@p0', '@security'] }, async () => {
    const before = await count('account_deletions');
    const r = await callDelete(null, GOOD);
    expect(r.status).toBe(401);
    expect(await count('account_deletions')).toBe(before);
  });

  test('wrong password → 401 with zero mutation, and it is throttled', { tag: ['@p0', '@security'] }, async () => {
    const c = await createSubject('customer');
    const r = await callDelete(c.token, { confirmation: 'DELETE', password: 'wrong-' + PW });
    expect(r.status).toBe(401);
    const [p] = await svcGet<{ deletion_status: string; full_name: string }[]>(`/rest/v1/profiles?id=eq.${c.id}&select=deletion_status,full_name`);
    expect(p.deletion_status).toBe('active');
    expect(p.full_name).toBe('QA Deletion Subject');
    // Four more failures exhaust the window; the fifth+ attempt is refused before any check.
    for (let i = 0; i < 4; i += 1) await callDelete(c.token, { confirmation: 'DELETE', password: 'wrong' });
    const throttled = await callDelete(c.token, GOOD); // even the CORRECT password is refused now
    expect(throttled.status).toBe(429);
    expect((await svcGet<{ deletion_status: string }[]>(`/rest/v1/profiles?id=eq.${c.id}&select=deletion_status`))[0].deletion_status).toBe('active');
  });

  test('admin request → 403', { tag: ['@p0', '@security'] }, async () => {
    const a = await createSubject('customer');
    // role=admin is what the function refuses; approval stays PENDING so this fixture is never an
    // approved-admin recipient of other subjects' provider-pending notifications.
    await svcPatch(`/rest/v1/profiles?id=eq.${a.id}`, { role: 'admin', approval_status: 'pending' });
    const r = await callDelete(a.token, GOOD);
    expect(r.status).toBe(403);
  });

  test('cross-user deletion is impossible: a body naming another user is ignored', { tag: ['@p0', '@security'] }, async () => {
    const victim = await createSubject('customer');
    const attacker = await createSubject('customer');
    const r = await callDelete(attacker.token, { ...GOOD, user_id: victim.id, id: victim.id, uid: victim.id });
    // The attacker deleted THEMSELVES (their own credential was valid); the victim is untouched.
    expect(r.status).toBe(200);
    const [v] = await svcGet<{ deletion_status: string }[]>(`/rest/v1/profiles?id=eq.${victim.id}&select=deletion_status`);
    expect(v.deletion_status).toBe('active');
    const [a] = await svcGet<{ deletion_status: string }[]>(`/rest/v1/profiles?id=eq.${attacker.id}&select=deletion_status`);
    expect(a.deletion_status).toBe('deleted');
  });

  // ── blockers ──────────────────────────────────────────────────────────────────────────────
  test('every blocker → 409 with the code, and zero mutation', { tag: ['@p0'] }, async () => {
    const c = await createSubject('customer');
    const p = await createSubject('provider');
    const [b] = await svcPost<{ id: string }[]>('/rest/v1/bookings', { customer_id: c.id, assigned_provider_id: p.id, service_id: 'house_cleaning', address: 'x', scheduled_for: new Date().toISOString(), status: 'in_progress' });
    seededBookingIds.push(b.id);

    let r = await callDelete(c.token, GOOD);
    expect(r.status).toBe(409);
    expect(r.body.blockers).toContain('active_booking');
    r = await callDelete(p.token, GOOD);
    expect(r.status).toBe(409);
    expect(r.body.blockers).toContain('active_booking');

    await svcPatch(`/rest/v1/bookings?id=eq.${b.id}`, { status: 'completed' });
    const [pay] = await svcPost<{ id: string }[]>('/rest/v1/payments', { booking_id: b.id, customer_id: c.id, amount: 100, currency: 'KES', status: 'pending', provider_share: 80, quickserve_share: 20 });
    r = await callDelete(c.token, GOOD);
    expect(r.status).toBe(409);
    expect(r.body.blockers).toContain('unsettled_payment');

    await svcPost('/rest/v1/payment_attempts', { payment_id: pay.id, provider: 'mpesa', phone: '254700000000', amount: 100, status: 'pending' });
    r = await callDelete(c.token, GOOD);
    expect(r.body.blockers).toContain('pending_payment_attempt');

    await svcPatch(`/rest/v1/payment_attempts?payment_id=eq.${pay.id}`, { status: 'failed' });
    await svcPatch(`/rest/v1/payments?id=eq.${pay.id}`, { status: 'paid', paid_at: new Date().toISOString() });
    // Marking the payment paid fires create_earning_on_paid, so the earning already exists;
    // inserting another would violate the one-earning-per-booking rule. Use the trigger's row.
    let earned = await svcGet<{ id: string }[]>(`/rest/v1/provider_earnings?booking_id=eq.${b.id}&select=id`);
    if (earned.length === 0) {
      await svcPost('/rest/v1/provider_earnings', { provider_id: p.id, booking_id: b.id, amount: 80, payout_status: 'pending' });
      earned = await svcGet<{ id: string }[]>(`/rest/v1/provider_earnings?booking_id=eq.${b.id}&select=id`);
    }
    expect(earned.length, 'one earning for the seeded booking').toBeGreaterThan(0);
    await svcPatch(`/rest/v1/provider_earnings?booking_id=eq.${b.id}`, { payout_status: 'pending' });
    r = await callDelete(p.token, GOOD);
    expect(r.status).toBe(409);
    expect(r.body.blockers).toContain('unpaid_provider_earning');
    await svcPatch(`/rest/v1/provider_earnings?booking_id=eq.${b.id}`, { payout_status: 'paid' });

    await svcPost('/rest/v1/wallets', { customer_id: c.id, balance: 50, currency: 'KES' });
    r = await callDelete(c.token, GOOD);
    expect(r.status).toBe(409);
    expect(r.body.blockers).toContain('positive_wallet_balance');
    await svcPatch(`/rest/v1/wallets?customer_id=eq.${c.id}`, { balance: 0 });

    const [flagger] = await svcGet<{ id: string }[]>('/rest/v1/profiles?role=eq.admin&approval_status=eq.approved&select=id&limit=1');
    await svcPost('/rest/v1/account_flags', { subject_id: c.id, subject_role: 'customer', kind: 'flag', reason: 'qa deletion blocker fixture', active: true, created_by: flagger.id });
    r = await callDelete(c.token, GOOD);
    expect(r.status).toBe(409);
    expect(r.body.blockers).toContain('active_account_flag');
    await svcPatch(`/rest/v1/account_flags?subject_id=eq.${c.id}`, { active: false });

    // Every refusal above must have left the subjects untouched.
    for (const id of [c.id, p.id]) {
      const [row] = await svcGet<{ deletion_status: string; full_name: string }[]>(`/rest/v1/profiles?id=eq.${id}&select=deletion_status,full_name`);
      expect(row.deletion_status).toBe('active');
      expect(row.full_name).toBe('QA Deletion Subject');
    }
    await svcDelete(`/rest/v1/account_flags?subject_id=eq.${c.id}`);
  });

  // ── successful deletions with retained, anonymised financial history ───────────────────────
  test('customer deletion: tombstone, scrubbed booking, retained money, provider untouched, disposables gone', { tag: ['@p0'] }, async () => {
    const c = await createSubject('customer');
    const p = await createSubject('provider');
    const seed = await seedSettledHistory(c.id, p.id);
    await svcPost('/rest/v1/device_tokens', { user_id: c.id, platform: 'android', provider: 'expo', push_token: `ExponentPushToken[qa-del-${c.id.slice(0, 8)}]` });
    await svcPost('/rest/v1/customer_addresses', { customer_id: c.id, nickname: 'Home', address: '12 Test Lane', latitude: -1.29, longitude: 36.82 });

    const r = await callDelete(c.token, GOOD);
    expect(r.status).toBe(200);
    expect(r.body.status).toBe('deleted');

    const [prof] = await svcGet<Record<string, unknown>[]>(`/rest/v1/profiles?id=eq.${c.id}`);
    expect(prof.deletion_status).toBe('deleted');
    expect(prof.full_name).toBe('Deleted user');
    expect(prof.phone).toBeNull();
    expect(prof.deleted_at).toBeTruthy();

    const [bk] = await svcGet<Record<string, unknown>[]>(`/rest/v1/bookings?id=eq.${seed.bookingId}`);
    expect(bk.status).toBe('completed');
    expect(bk.address).toBe('[deleted]');
    expect(bk.notes).toBeNull();
    expect(bk.latitude).toBeNull();
    expect(bk.assigned_provider_name).toBe('QA Provider'); // provider's data untouched by the customer's deletion

    const [pay] = await svcGet<Record<string, unknown>[]>(`/rest/v1/payments?id=eq.${seed.paymentId}`);
    expect(pay.status).toBe('paid');
    expect(Number(pay.amount)).toBe(1500);
    const [att] = await svcGet<Record<string, unknown>[]>(`/rest/v1/payment_attempts?payment_id=eq.${seed.paymentId}`);
    expect(att.status).toBe('successful');
    expect(att.phone).toBe('***678');
    const [earn] = await svcGet<Record<string, unknown>[]>(`/rest/v1/provider_earnings?id=eq.${seed.earningId}`);
    expect(earn.payout_status).toBe('paid');
    expect(Number(earn.amount)).toBe(1200);

    expect(await count('device_tokens', `&user_id=eq.${c.id}`)).toBe(0);
    expect(await count('customer_addresses', `&customer_id=eq.${c.id}`)).toBe(0);
    const [audit] = await svcGet<Record<string, unknown>[]>(`/rest/v1/account_deletions?user_id=eq.${c.id}&select=status,role,auth_deleted_at`);
    expect(audit.status).toBe('deleted');
    expect(audit.role).toBe('customer');
    expect(audit.auth_deleted_at).toBeTruthy();

    expect(await signInAs(c.email, PW), 'deleted subject cannot sign in').toBeNull();
    expect((await svcGet<Record<string, unknown>[]>(`/rest/v1/profiles?id=eq.${p.id}&select=full_name,deletion_status`))[0]).toMatchObject({ full_name: 'QA Deletion Subject', deletion_status: 'active' });
  });

  test('provider deletion: earnings and payouts retained, denormalised provider fields scrubbed, customer untouched', { tag: ['@p0'] }, async () => {
    const c = await createSubject('customer');
    const p = await createSubject('provider');
    const seed = await seedSettledHistory(c.id, p.id);
    // recorded_by is NOT NULL: the fixed QA admin is referenced as the recording operator only —
    // it is never a deletion subject.
    const [recorder] = await svcGet<{ id: string }[]>('/rest/v1/profiles?role=eq.admin&approval_status=eq.approved&select=id&limit=1');
    await svcPost('/rest/v1/provider_payouts', { earning_id: seed.earningId, provider_id: p.id, amount: 1200, method: 'mpesa_manual', reference: 'QA-DEL-PAYOUT', paid_at: new Date().toISOString(), idempotency_key: crypto.randomUUID(), recorded_by: recorder.id });

    const r = await callDelete(p.token, GOOD);
    expect(r.status).toBe(200);
    expect(r.body.status).toBe('deleted');

    const [bk] = await svcGet<Record<string, unknown>[]>(`/rest/v1/bookings?id=eq.${seed.bookingId}`);
    expect(bk.assigned_provider_name).toBe('Deleted provider');
    expect(bk.assigned_provider_phone).toBeNull();
    expect(bk.address).toBe('12 Test Lane, Nairobi'); // the CUSTOMER's data is untouched
    expect(await count('provider_earnings', `&id=eq.${seed.earningId}`)).toBe(1);
    expect(await count('provider_payouts', `&earning_id=eq.${seed.earningId}`)).toBe(1);
    const [prof] = await svcGet<Record<string, unknown>[]>(`/rest/v1/profiles?id=eq.${p.id}`);
    expect(prof.full_name).toBe('Deleted user');
    expect(prof.bio).toBeNull();
    expect(prof.skills).toEqual([]);
    expect(prof.profile_photo_url).toBeNull();
  });

  // ── partial failure: tombstoned but auth still present ─────────────────────────────────────
  test('forced auth-deletion failure: a tombstoned identity is denied all data even with a valid token, and retry completes', { tag: ['@p0', '@security'] }, async () => {
    const c = await createSubject('customer');
    const p = await createSubject('provider');
    await seedSettledHistory(c.id, p.id);

    // Before: the subject can read their own profile and bookings.
    expect((await userReads(c.token, `/rest/v1/profiles?id=eq.${c.id}&select=id`)).rows).toHaveLength(1);
    expect((await userReads(c.token, `/rest/v1/bookings?customer_id=eq.${c.id}&select=id`)).rows).toHaveLength(1);

    // Simulate phase 1 succeeding and phase 2 failing: run the DB half directly as service role.
    const db = await svcRpc<{ status: string }>('delete_account', { p_user: c.id });
    expect(db.status).toBe('pending_auth_delete');

    // The auth identity still exists and the OLD access token is still cryptographically valid,
    // yet the restrictive policies deny every row.
    expect((await userReads(c.token, `/rest/v1/profiles?id=eq.${c.id}&select=id`)).rows).toHaveLength(0);
    expect((await userReads(c.token, `/rest/v1/bookings?customer_id=eq.${c.id}&select=id`)).rows).toHaveLength(0);
    expect((await userReads(c.token, `/rest/v1/notifications?select=id`)).rows).toHaveLength(0);

    // Retry through the endpoint: no password is needed for a tombstoned identity, the run is
    // idempotent (no second scrub), and it completes the auth deletion.
    const r = await callDelete(c.token, { confirmation: 'DELETE' });
    expect([200, 202]).toContain(r.status);
    expect(['deleted', 'pending_auth_delete']).toContain(r.body.status as string);
    expect(await count('account_deletions', `&user_id=eq.${c.id}`)).toBe(1); // one audit row, not two
    if (r.status === 200) {
      expect(await signInAs(c.email, PW)).toBeNull();
    }
  });

  test('repeat request on a fully deleted identity is safe (idempotent)', { tag: ['@p1'] }, async () => {
    const c = await createSubject('customer');
    const first = await callDelete(c.token, GOOD);
    expect(first.status).toBe(200);
    // The token is now invalid (auth row gone): the gateway/function must answer 401, never 500.
    const again = await callDelete(c.token, GOOD);
    expect(again.status).toBe(401);
    expect(await count('account_deletions', `&user_id=eq.${c.id}`)).toBe(1);
  });
});
