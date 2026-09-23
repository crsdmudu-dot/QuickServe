import { test, expect, request, type APIRequestContext } from '@playwright/test';
import {
  certificationConfigured,
  certificationSkipReason,
  qaAccount,
  qaSupabaseAnonKey,
  qaSupabaseUrl,
} from '../support/connected/qa-accounts';
import { adminCreateUser, approvedAdminProfileIds, signInAs } from '../support/connected/qa-auth';
import {
  BUCKET,
  ServiceApi,
  cleanupRun,
  verifyRestoration,
  type HttpClient,
  type HttpResponse,
  type RunFixtures,
} from '../support/connected/deletion-work-cleanup';

/**
 * Phase B1 — durable deletion work certification (connected, certified QA only). NOT RUN until
 * authorised; see docs/qa/PHASE-B1-DELETION-WORK-RUN-SHEET.md.
 *
 * Suites C0–C6 exercise the REAL 0059/0060 routines, the real Storage API and the real Auth admin
 * API through the deployed `delete-account` and `deletion-worker` functions. Nothing here is a
 * model. A case that cannot produce a platform event deterministically is labelled a SEEDED
 * SIMULATION in its title; the one platform-level in-flight upload case is opt-in and
 * observational (`QA_DW_INFLIGHT=1`).
 *
 * Initial Auth outcome (review finding 3). Whether the platform deletes an identity that still
 * owns Storage objects is a platform fact this suite RECORDS (C5a). Every fixture therefore
 * accepts exactly the two valid initial combinations and validates every dimension:
 *   200 {status:'deleted',             auth_state:'deleted',       access_state:'revoked', cleanup_state:'pending'}
 *   202 {status:'pending_auth_delete', auth_state:'pending_retry', access_state:'revoked', cleanup_state:'pending'}
 * and drives to EVENTUAL Auth deletion through the worker (advancing only this run's own retry
 * timing). Nothing assumes the identity is gone before that is established.
 *
 * Fixtures: every identity, booking, object, intent, hold and case this run creates is tracked by
 * exact id or exact path and removed in afterAll by `cleanupRun` (dependency order, every response
 * validated, no type/time/prefix sweeps). Restoration is asserted by `verifyRestoration` against
 * the baseline captured before the first fixture existed; any cleanup failure fails the run.
 * Object absence is established only by the service-only database read `deletion_object_exists`.
 *
 * Time-gated steps (settling window, backoff, upload boundary, leases) are advanced by patching
 * the run's OWN rows through the service role; the suite never sleeps.
 *
 * Required env: QA_SUPABASE_URL, QA_SUPABASE_ANON_KEY, QA_SERVICE_ROLE_KEY, QA_DELETION_WORKER_SECRET.
 * Optional: QA_ADMIN_EMAIL/QA_ADMIN_PASSWORD (the admin-JWT refusal in C6b is reported NOT RUN without them).
 */
const PW = 'QaDeletionWork-123!';
const PREFIX = 'qa-dw';
const ZERO_PHONE = '+254700000002';
const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da6364f8cfc00000020101f6c5c4f60000000049454e44ae426082', 'hex');

type Row = Record<string, unknown>;
type Subject = { id: string; email: string; token: string };
type Initial = { status: number; body: Row; authInitially: 'deleted' | 'pending_retry' };

test.describe('Phase B1 — durable deletion work', { tag: ['@certification', '@connected'] }, () => {
  // SERIAL, one worker (QA run 2, 2026-09-24): the project config is fullyParallel, and every
  // `worker()` call processes EVERY claimable intent on the shared project. Run in parallel, one
  // case's worker call removed another case's object before its hold was applied (C3a, C3c, C6b),
  // and per-worker baselines were captured while other workers' fixtures existed (restoration
  // mismatches in C2a, C2d, C4, C5c). The product paths themselves passed. Serial mode makes the
  // suite deterministic; the run sheet also passes --workers=1 explicitly.
  test.describe.configure({ mode: 'serial' });
  const fixtures: RunFixtures = { userIds: [], bookingIds: [], objectPaths: [], caseIds: [], holdIds: [], adminRecipientIds: [] };
  let api: ServiceApi;
  let baseline: { totals: Record<string, number>; health: Row } = { totals: {}, health: {} };
  let adminProfileId: string | null = null;

  const configured = () => certificationConfigured() && !!process.env.QA_SERVICE_ROLE_KEY && !!process.env.QA_DELETION_WORKER_SECRET;

  test.beforeEach(({}, testInfo) => {
    test.skip(!certificationConfigured(), certificationSkipReason());
    test.skip(!process.env.QA_SERVICE_ROLE_KEY, 'QA_SERVICE_ROLE_KEY is required.');
    test.skip(!process.env.QA_DELETION_WORKER_SECRET, 'QA_DELETION_WORKER_SECRET is required (the worker function secret).');
    test.skip(testInfo.project.name !== 'chromium', 'Connected coverage is Chromium-only.');
  });

  test.beforeAll(async ({}, testInfo) => {
    if (!configured() || testInfo.project.name !== 'chromium') return;
    api = new ServiceApi(playwrightHttp());
    fixtures.adminRecipientIds = await approvedAdminProfileIds();
    [adminProfileId] = fixtures.adminRecipientIds;
    baseline = { totals: await totals(), health: await api.rpc<Row>('deletion_work_health', {}) };
  });

  test.afterAll(async ({}, testInfo) => {
    if (!configured() || testInfo.project.name !== 'chromium') return;
    test.setTimeout(10 * 60 * 1000);
    const report = await cleanupRun(api, fixtures);
    const violations = await verifyRestoration(api, fixtures, baseline, totals);
    const problems = [...report.failures.map((f) => `cleanup: ${f}`), ...violations.map((v) => `restoration: ${v}`)];
    if (problems.length) throw new Error(`deletion-work teardown failed:\n${problems.join('\n')}`);
  });

  // ── transport ─────────────────────────────────────────────────────────────────────────────
  function playwrightHttp(): HttpClient {
    const key = process.env.QA_SERVICE_ROLE_KEY as string;
    return {
      async request(method, path, body, headers): Promise<HttpResponse> {
        const ctx = await request.newContext({ baseURL: qaSupabaseUrl(), extraHTTPHeaders: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', ...(headers ?? {}) } });
        try {
          const r = await ctx.fetch(path, { method, data: body === undefined ? undefined : body });
          return { status: r.status(), headers: r.headers(), text: await r.text() };
        } finally { await ctx.dispose(); }
      },
    };
  }
  async function service(): Promise<APIRequestContext> {
    const key = process.env.QA_SERVICE_ROLE_KEY as string;
    return request.newContext({ baseURL: qaSupabaseUrl(), extraHTTPHeaders: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' } });
  }
  async function svcPost<T = unknown>(path: string, data: unknown): Promise<T> {
    const s = await service();
    try { const r = await s.post(path, { data, headers: { Prefer: 'return=representation' } }); expect(r.status(), `POST ${path.split('?')[0]}`).toBeLessThan(300); return (await r.json()) as T; } finally { await s.dispose(); }
  }
  async function svcPatch(path: string, data: unknown): Promise<void> {
    const s = await service();
    try { const r = await s.patch(path, { data }); expect(r.status(), `PATCH ${path.split('?')[0]}`).toBeLessThan(300); } finally { await s.dispose(); }
  }
  async function totals(): Promise<Record<string, number>> {
    const out: Record<string, number> = {};
    for (const t of ['bookings', 'payments', 'payment_attempts', 'provider_earnings', 'notifications', 'booking_activity', 'booking_photos', 'profiles', 'device_tokens', 'support_cases', 'legal_holds', 'legal_hold_items', 'deletion_photo_intents', 'account_deletions']) out[t] = await api.count(t);
    out.account_deletion_attempts = await api.count('account_deletion_attempts', '', 'user_id'); // keyed by user_id, no id column
    out.tombstones = await api.count('profiles', '&deleted_at=not.is.null');
    return out;
  }

  // ── storage (real API) ────────────────────────────────────────────────────────────────────
  async function uploadAs(token: string | null, path: string, opts: { upsert?: boolean; serviceRole?: boolean } = {}): Promise<number> {
    const key = opts.serviceRole ? (process.env.QA_SERVICE_ROLE_KEY as string) : (qaSupabaseAnonKey() as string);
    const auth = opts.serviceRole ? `Bearer ${key}` : token ? `Bearer ${token}` : undefined;
    const ctx = await request.newContext({ baseURL: qaSupabaseUrl(), extraHTTPHeaders: { apikey: key, ...(auth ? { Authorization: auth } : {}), 'Content-Type': 'image/png', 'x-upsert': opts.upsert ? 'true' : 'false' } });
    try { const r = await ctx.post(`/storage/v1/object/${BUCKET}/${path}`, { data: PNG }); if (r.status() === 200 && !fixtures.objectPaths.includes(path)) fixtures.objectPaths.push(path); return r.status(); } finally { await ctx.dispose(); }
  }
  async function storageOp(token: string, op: 'move' | 'copy', from: string, to: string): Promise<number> {
    const ctx = await request.newContext({ baseURL: qaSupabaseUrl(), extraHTTPHeaders: { apikey: qaSupabaseAnonKey() as string, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } });
    try { const r = await ctx.post(`/storage/v1/object/${op}`, { data: { bucketId: BUCKET, sourceKey: from, destinationKey: to } }); if (r.status() === 200 && !fixtures.objectPaths.includes(to)) fixtures.objectPaths.push(to); return r.status(); } finally { await ctx.dispose(); }
  }
  async function removeAs(token: string, path: string): Promise<{ status: number; items: number }> {
    const ctx = await request.newContext({ baseURL: qaSupabaseUrl(), extraHTTPHeaders: { apikey: qaSupabaseAnonKey() as string, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } });
    try { const r = await ctx.delete(`/storage/v1/object/${BUCKET}`, { data: { prefixes: [path] } }); const j = (await r.json().catch(() => [])) as unknown[]; return { status: r.status(), items: Array.isArray(j) ? j.length : 0 }; } finally { await ctx.dispose(); }
  }
  /** Authoritative: the database row. Never inferred from a Storage HTTP status. */
  const objectExists = (path: string) => api.objectExists(path);
  async function objectEtag(path: string): Promise<string> {
    const s = await service();
    try { const r = await s.get(`/storage/v1/object/info/authenticated/${BUCKET}/${path}`); expect(r.status(), `info ${path}`).toBe(200); return ((await r.json()) as { etag: string }).etag; } finally { await s.dispose(); }
  }

  // ── functions ─────────────────────────────────────────────────────────────────────────────
  async function callDelete(token: string | null): Promise<{ status: number; body: Row }> {
    const ctx = await request.newContext({ baseURL: qaSupabaseUrl(), extraHTTPHeaders: { apikey: qaSupabaseAnonKey() as string, 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) } });
    try { const r = await ctx.post('/functions/v1/delete-account', { data: { confirmation: 'DELETE', password: PW } }); let parsed: Row = {}; try { parsed = (await r.json()) as Row; } catch { /* non-JSON */ } return { status: r.status(), body: parsed }; } finally { await ctx.dispose(); }
  }
  /** The worker path: the shared secret only, NO Authorization header (gateway verify_jwt=false for this function). */
  async function worker(opts: { secret?: string | null; limit?: number; authorization?: string } = {}): Promise<{ status: number; body: Row }> {
    const secret = opts.secret === undefined ? (process.env.QA_DELETION_WORKER_SECRET as string) : opts.secret;
    const ctx = await request.newContext({ baseURL: qaSupabaseUrl(), extraHTTPHeaders: { 'Content-Type': 'application/json', ...(secret !== null ? { 'x-worker-secret': secret } : {}), ...(opts.authorization ? { Authorization: opts.authorization } : {}) } });
    try { const r = await ctx.post('/functions/v1/deletion-worker', { data: { limit: opts.limit ?? 25 } }); let parsed: Row = {}; try { parsed = (await r.json()) as Row; } catch { /* */ } return { status: r.status(), body: parsed }; } finally { await ctx.dispose(); }
  }

  // ── fixtures ──────────────────────────────────────────────────────────────────────────────
  async function createSubject(role: 'customer' | 'provider'): Promise<Subject> {
    const email = `${PREFIX}-${role}-${crypto.randomUUID()}@example.com`;
    const r = await adminCreateUser(email, PW, { full_name: 'QA Deletion Work Subject', phone: ZERO_PHONE, role });
    expect(r.status, `create ${role}`).toBe(200);
    const id = (r.body.id as string) ?? ((r.body.user as { id?: string } | undefined)?.id as string);
    expect(id).toBeTruthy();
    fixtures.userIds.push(id);
    if (role === 'provider') await svcPatch(`/rest/v1/profiles?id=eq.${id}`, { approval_status: 'approved' });
    const token = await signInAs(email, PW);
    expect(token, 'subject can sign in').toBeTruthy();
    return { id, email, token: token as string };
  }
  async function seedCompletedBooking(customerId: string, providerId: string): Promise<string> {
    const [b] = await svcPost<{ id: string }[]>('/rest/v1/bookings', {
      customer_id: customerId, assigned_provider_id: providerId, service_id: 'house_cleaning', address: '12 Test Lane, Nairobi', notes: 'gate code 4321',
      latitude: -1.29, longitude: 36.82, scheduled_for: new Date().toISOString(), status: 'completed', assigned_provider_name: 'QA Provider', assigned_provider_phone: ZERO_PHONE,
    });
    fixtures.bookingIds.push(b.id);
    const [p] = await svcPost<{ id: string }[]>('/rest/v1/payments', { booking_id: b.id, customer_id: customerId, amount: 1500, currency: 'KES', status: 'paid', provider_share: 1200, quickserve_share: 300, paid_at: new Date().toISOString() });
    await svcPost('/rest/v1/payment_attempts', { payment_id: p.id, provider: 'mpesa', phone: '254712345678', amount: 1500, status: 'successful' });
    await svcPost('/rest/v1/provider_earnings', { provider_id: providerId, booking_id: b.id, amount: 1200, payout_status: 'paid' });
    return b.id;
  }
  async function uploadPhoto(user: Subject, bookingId: string, photoType: 'issue' | 'before' | 'after' | 'completion', withRow = true): Promise<string> {
    const path = `${bookingId}/${crypto.randomUUID()}.png`;
    expect(await uploadAs(user.token, path), `upload ${photoType}`).toBe(200);
    if (withRow) {
      const ctx = await request.newContext({ baseURL: qaSupabaseUrl(), extraHTTPHeaders: { apikey: qaSupabaseAnonKey() as string, Authorization: `Bearer ${user.token}`, 'Content-Type': 'application/json', Prefer: 'return=representation' } });
      try { const r = await ctx.post('/rest/v1/booking_photos', { data: { booking_id: bookingId, uploaded_by: user.id, photo_url: path, photo_type: photoType } }); expect(r.status(), 'metadata row').toBeLessThan(300); } finally { await ctx.dispose(); }
    }
    return path;
  }
  async function deletionRow(userId: string): Promise<Row> {
    const rows = await api.getRows<Row>(`/rest/v1/account_deletions?user_id=eq.${userId}&status=neq.blocked&order=requested_at.desc&limit=1`);
    expect(rows.length, 'executed deletion row').toBe(1);
    return rows[0];
  }
  const intentsOf = (deletionId: string) => api.getRows<Row>(`/rest/v1/deletion_photo_intents?account_deletion_id=eq.${deletionId}&order=created_at.asc`);
  const past = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString();
  const future = (minutes: number) => new Date(Date.now() + minutes * 60_000).toISOString();
  const openSettling = (d: string) => svcPatch(`/rest/v1/account_deletions?id=eq.${d}`, { cleanup_eligible_at: past(1) });
  const passBoundary = (d: string) => svcPatch(`/rest/v1/account_deletions?id=eq.${d}`, { cleanup_boundary_at: past(1) });
  const forceHourlySweep = (d: string) => svcPatch(`/rest/v1/account_deletions?id=eq.${d}`, { last_sweep_at: past(120) });
  const dueAuthRetry = (d: string) => svcPatch(`/rest/v1/account_deletions?id=eq.${d}`, { auth_next_attempt_at: past(1) });

  /** Deletes through the function and validates one of the two valid initial combinations. */
  async function deleteViaFunction(c: Subject): Promise<Initial> {
    const r = await callDelete(c.token);
    const common = { ok: true, access_state: 'revoked', cleanup_state: 'pending' };
    if (r.status === 200) {
      expect(r.body).toMatchObject({ ...common, status: 'deleted', auth_state: 'deleted' });
      return { ...r, authInitially: 'deleted' };
    }
    expect(r.status, `delete-account must answer 200 (deleted) or 202 (pending_retry); got ${r.status} ${JSON.stringify(r.body)}`).toBe(202);
    expect(r.body).toMatchObject({ ...common, status: 'pending_auth_delete', auth_state: 'pending_retry' });
    return { ...r, authInitially: 'pending_retry' };
  }
  /** Drives an account with NO held objects to eventual Auth deletion, advancing only its own retry timing. */
  async function ensureAuthDeleted(c: Subject, deletionId: string, maxRounds = 4): Promise<void> {
    for (let n = 0; n < maxRounds; n += 1) {
      const d = await deletionRow(c.id);
      if (d.auth_state === 'deleted') break;
      expect(d.auth_state, 'auth must be retryable, not needs_operator, for an unheld account').toBe('pending_retry');
      await dueAuthRetry(deletionId);
      await worker();
    }
    expect((await deletionRow(c.id)).auth_state).toBe('deleted');
    expect(await api.authUserExists(c.id)).toBe(false);
  }
  async function deleteCustomerWithPhotos(nPhotos: number): Promise<{ c: Subject; p: Subject; bookingId: string; paths: string[]; deletion: Row; initial: Initial }> {
    const c = await createSubject('customer');
    const p = await createSubject('provider');
    const bookingId = await seedCompletedBooking(c.id, p.id);
    const paths: string[] = [];
    for (let i = 0; i < nPhotos; i += 1) paths.push(await uploadPhoto(c, bookingId, 'issue'));
    const initial = await deleteViaFunction(c);
    const deletion = await deletionRow(c.id);
    expect(initial.body.deletion_id).toBe(deletion.id);
    return { c, p, bookingId, paths, deletion, initial };
  }
  /** Per-deletion accounting: never read from the worker's aggregate counters (other fixtures may be in flight). */
  async function ownIntentStates(deletionId: string): Promise<Record<string, number>> {
    const out: Record<string, number> = {};
    for (const i of await intentsOf(deletionId)) { const k = `${i.state}:${i.outcome ?? '-'}`; out[k] = (out[k] ?? 0) + 1; }
    return out;
  }

  // ── C0 gateway ────────────────────────────────────────────────────────────────────────────
  test('C0 worker gateway: secret only; missing or wrong secret → 401; a user JWT is neither required nor sufficient', { tag: ['@p0', '@security'] }, async () => {
    expect((await worker({ secret: null })).status).toBe(401);
    expect((await worker({ secret: 'wrong-secret' })).status).toBe(401);
    const c = await createSubject('customer');
    expect((await worker({ secret: null, authorization: `Bearer ${c.token}` })).status).toBe(401);
    const ok = await worker();
    expect(ok.status).toBe(200);
    expect(ok.body.ok).toBe(true);
  });

  // ── C1 normal path ────────────────────────────────────────────────────────────────────────
  test('C1 normal path: own photos removed and verified (database read), counterparty photo byte-identical, provisional, complete only after the boundary; Auth deleted eventually', { tag: ['@p0'] }, async () => {
    const c = await createSubject('customer');
    const p = await createSubject('provider');
    const bookingId = await seedCompletedBooking(c.id, p.id);
    const own = [await uploadPhoto(c, bookingId, 'issue'), await uploadPhoto(c, bookingId, 'issue')];
    const theirs = await uploadPhoto(p, bookingId, 'completion');
    const theirsEtag = await objectEtag(theirs);

    const initial = await deleteViaFunction(c);
    test.info().annotations.push({ type: 'U4-initial', description: `auth initially ${initial.authInitially}` });
    const deletion = await deletionRow(c.id);
    const intents = await intentsOf(deletion.id as string);
    expect(intents.map((i) => i.object_path).sort()).toEqual([...own].sort());
    expect(intents.every((i) => i.state === 'planned' && i.expected_object_id)).toBe(true);

    expect((await worker()).status).toBe(200);
    expect(await ownIntentStates(deletion.id as string)).toEqual({ 'verified:removed': 2 });
    for (const path of own) expect(await objectExists(path), `own object gone: ${path}`).toBe(false);
    expect(await api.count('booking_photos', `&uploaded_by=eq.${c.id}`)).toBe(0);
    expect(await objectExists(theirs)).toBe(true);
    expect(await objectEtag(theirs)).toBe(theirsEtag);
    expect((await deletionRow(c.id)).cleanup_state).toBe('pending'); // settling window

    await openSettling(deletion.id as string);
    await worker();
    expect(await deletionRow(c.id)).toMatchObject({ cleanup_state: 'provisional', closed_at: null, final_sweep_at: null });
    await ensureAuthDeleted(c, deletion.id as string);
    await passBoundary(deletion.id as string);
    await worker();
    const done = await deletionRow(c.id);
    expect(done).toMatchObject({ cleanup_state: 'complete', auth_state: 'deleted' });
    expect(done.final_sweep_at).toBeTruthy();
    expect(done.closed_at).toBeTruthy();
  });

  // ── C2 uploads in flight / late ───────────────────────────────────────────────────────────
  test('C2a policy: a tombstoned identity cannot add an object (still-valid JWT)', { tag: ['@p0', '@security'] }, async () => {
    const { c, bookingId } = await deleteCustomerWithPhotos(1);
    const path = `${bookingId}/${crypto.randomUUID()}.png`;
    expect(await uploadAs(c.token, path)).toBeGreaterThanOrEqual(400);
    expect(await objectExists(path)).toBe(false);
  });

  test('C2b SEEDED SIMULATION (intent row dropped): an owned object the inventory missed is rediscovered by the completion sweep and removed', async () => {
    const c = await createSubject('customer');
    const p = await createSubject('provider');
    const bookingId = await seedCompletedBooking(c.id, p.id);
    const orphan = await uploadPhoto(c, bookingId, 'issue', false); // owned object, no metadata row
    await deleteViaFunction(c);
    const deletion = await deletionRow(c.id);
    const [intent] = await intentsOf(deletion.id as string);
    expect(intent.object_path).toBe(orphan);
    await api.deleteRows(`/rest/v1/deletion_photo_intents?id=eq.${intent.id}`); // the simulated gap
    await openSettling(deletion.id as string);
    await worker();
    expect((await deletionRow(c.id)).cleanup_state).toBe('pending');
    expect(await intentsOf(deletion.id as string)).toHaveLength(1);
    await worker();
    expect(await objectExists(orphan)).toBe(false);
    expect(await ownIntentStates(deletion.id as string)).toEqual({ 'verified:removed': 1 });
    expect((await deletionRow(c.id)).cleanup_state).toBe('provisional');
  });

  test('C2c a metadata row reappearing on an already-inventoried path cannot be reported complete: operator', async () => {
    const { c, bookingId, paths, deletion } = await deleteCustomerWithPhotos(1);
    await worker();
    await openSettling(deletion.id as string);
    await worker();
    expect((await deletionRow(c.id)).cleanup_state).toBe('provisional');
    await svcPost('/rest/v1/booking_photos', { booking_id: bookingId, uploaded_by: c.id, photo_url: paths[0], photo_type: 'issue' });
    await passBoundary(deletion.id as string);
    await worker();
    expect(await deletionRow(c.id)).toMatchObject({ cleanup_state: 'needs_operator', closed_at: null });
  });

  test('C2d SEEDED SIMULATION (late metadata row): a provisional account reopens to pending when the sweep finds new owned data; final completion needs the boundary AND a final sweep', async () => {
    const { c, bookingId, deletion } = await deleteCustomerWithPhotos(1);
    await worker();
    await openSettling(deletion.id as string);
    await worker();
    expect(await deletionRow(c.id)).toMatchObject({ cleanup_state: 'provisional', final_sweep_at: null });
    // Late fixture, explicitly labelled: a metadata row for a NEW path owned by the deleted user
    // (as an in-flight app write would leave; the object itself never landed).
    const latePath = `${bookingId}/${crypto.randomUUID()}.png`;
    await svcPost('/rest/v1/booking_photos', { booking_id: bookingId, uploaded_by: c.id, photo_url: latePath, photo_type: 'issue' });
    await forceHourlySweep(deletion.id as string);
    await worker();
    const reopened = await deletionRow(c.id);
    expect(reopened).toMatchObject({ cleanup_state: 'pending', final_sweep_at: null });
    const late = (await intentsOf(deletion.id as string)).find((i) => i.object_path === latePath);
    expect(late).toMatchObject({ state: 'planned', expected_object_id: null });
    await worker(); // processes the late intent: absent object → verified/absent, row removed
    expect((await intentsOf(deletion.id as string)).find((i) => i.object_path === latePath)).toMatchObject({ state: 'verified', outcome: 'absent' });
    expect(await api.count('booking_photos', `&photo_url=eq.${encodeURIComponent(latePath)}`)).toBe(0);
    await openSettling(deletion.id as string);
    await worker();
    expect(await deletionRow(c.id)).toMatchObject({ cleanup_state: 'provisional', final_sweep_at: null }); // boundary not passed: not complete
    await passBoundary(deletion.id as string);
    await worker();
    const done = await deletionRow(c.id);
    expect(done.cleanup_state).toBe('complete');
    expect(done.final_sweep_at).toBeTruthy();
  });

  test('C2f outage past the boundary: a provisional account with no worker runs is still selected and finalised late, never skipped', async () => {
    const { c, deletion } = await deleteCustomerWithPhotos(1);
    await worker();
    await openSettling(deletion.id as string);
    await worker();
    expect((await deletionRow(c.id)).cleanup_state).toBe('provisional');
    await svcPatch(`/rest/v1/account_deletions?id=eq.${deletion.id}`, { cleanup_boundary_at: past(3 * 24 * 60), last_sweep_at: past(3 * 24 * 60) });
    await worker();
    const done = await deletionRow(c.id);
    expect(done.cleanup_state).toBe('complete');
    expect(done.final_sweep_at).toBeTruthy();
  });

  test('C2e PLATFORM (opt-in, observational): a standard upload started before deletion and completing after it', async () => {
    test.skip(process.env.QA_DW_INFLIGHT !== '1', 'Opt-in: set QA_DW_INFLIGHT=1. Observational only; timing is not deterministic.');
    const c = await createSubject('customer');
    const p = await createSubject('provider');
    const bookingId = await seedCompletedBooking(c.id, p.id);
    const path = `${bookingId}/${crypto.randomUUID()}.png`;
    const big = Buffer.alloc(8 * 1024 * 1024, 1);
    const ctx = await request.newContext({ baseURL: qaSupabaseUrl(), extraHTTPHeaders: { apikey: qaSupabaseAnonKey() as string, Authorization: `Bearer ${c.token}`, 'Content-Type': 'application/octet-stream' } });
    const upload = ctx.post(`/storage/v1/object/${BUCKET}/${path}`, { data: big, timeout: 120_000 });
    const del = await callDelete(c.token);
    const up = await upload; await ctx.dispose();
    if (await objectExists(path)) fixtures.objectPaths.push(path);
    test.info().annotations.push({ type: 'observation', description: `delete=${del.status} upload=${up.status()} objectAfter=${await objectExists(path)}` });
    const deletion = await deletionRow(c.id);
    await openSettling(deletion.id as string); await passBoundary(deletion.id as string);
    await worker(); await worker();
    test.info().annotations.push({ type: 'observation', description: `cleanup_state=${(await deletionRow(c.id)).cleanup_state} objectFinal=${await objectExists(path)}` });
  });

  // ── C3 holds ──────────────────────────────────────────────────────────────────────────────
  test('C3a legal hold before the worker: held and provisional with the reference; release → re-planned → verified → complete after the boundary', async () => {
    const { c, bookingId, paths, deletion } = await deleteCustomerWithPhotos(1);
    const hold = await api.rpc<Row>('apply_hold', { p_scope: 'booking', p_booking: bookingId, p_user: null, p_source: 'legal', p_reference: `${PREFIX}-matter-1`, p_case_id: null, p_placed_by: null });
    fixtures.holdIds.push(hold.hold_id as string);
    expect(hold.items).toEqual({ held: 1 });
    await worker();
    expect(await objectExists(paths[0])).toBe(true);
    await openSettling(deletion.id as string);
    await worker();
    expect(await deletionRow(c.id)).toMatchObject({ cleanup_state: 'provisional', retained_exception_ref: `${PREFIX}-matter-1` });
    const rel = await api.rpc<Row>('release_hold', { p_hold: hold.hold_id, p_released_by: null, p_note: 'qa release' });
    expect(rel.replanned).toBe(1);
    expect((await deletionRow(c.id)).cleanup_state).toBe('provisional'); // lazily reopened by the worker, not by release_hold
    await worker();
    expect(await ownIntentStates(deletion.id as string)).toEqual({ 'verified:removed': 1 });
    await passBoundary(deletion.id as string);
    await worker();
    expect(await deletionRow(c.id)).toMatchObject({ cleanup_state: 'complete', retained_exception_ref: null });
  });

  test('C3b a hold after authorisation records authorized_before_hold; a hold after removal records already_removed', async () => {
    const { bookingId, deletion } = await deleteCustomerWithPhotos(2);
    const [i1] = await intentsOf(deletion.id as string);
    await svcPatch(`/rest/v1/deletion_photo_intents?id=eq.${i1.id}`, { state: 'destroying', destroy_authorized_at: new Date().toISOString() });
    const h1 = await api.rpc<Row>('apply_hold', { p_scope: 'booking', p_booking: bookingId, p_user: null, p_source: 'legal', p_reference: `${PREFIX}-late`, p_case_id: null, p_placed_by: null });
    fixtures.holdIds.push(h1.hold_id as string);
    expect(h1.items).toEqual({ authorized_before_hold: 1, held: 1 });
    await api.rpc('release_hold', { p_hold: h1.hold_id, p_released_by: null, p_note: 'qa' });
    await worker();
    expect(await ownIntentStates(deletion.id as string)).toEqual({ 'verified:removed': 2 });
    const h2 = await api.rpc<Row>('apply_hold', { p_scope: 'booking', p_booking: bookingId, p_user: null, p_source: 'legal', p_reference: `${PREFIX}-after`, p_case_id: null, p_placed_by: null });
    fixtures.holdIds.push(h2.hold_id as string);
    expect(h2.items).toEqual({ already_removed: 2 });
  });

  test('C3c support-case hold follows the case: A held; moved to B → A released (note), B held while A keeps an independent legal hold; case closed → B released; A released only with its own hold', async () => {
    test.skip(!adminProfileId, 'An approved admin profile is required to create a support case (NOT RUN without one).');
    const c = await createSubject('customer');
    const p = await createSubject('provider');
    const bookingA = await seedCompletedBooking(c.id, p.id);
    const bookingB = await seedCompletedBooking(c.id, p.id);
    const pathA = await uploadPhoto(c, bookingA, 'issue');
    const pathB = await uploadPhoto(c, bookingB, 'issue');
    await deleteViaFunction(c);
    const deletion = await deletionRow(c.id);
    const intentOn = async (path: string) => (await intentsOf(deletion.id as string)).find((i) => i.object_path === path) as Row;
    // Independent legal hold on A, then the case on A.
    const legal = await api.rpc<Row>('apply_hold', { p_scope: 'booking', p_booking: bookingA, p_user: null, p_source: 'legal', p_reference: `${PREFIX}-legal-A`, p_case_id: null, p_placed_by: null });
    fixtures.holdIds.push(legal.hold_id as string);
    const [cs] = await svcPost<Row[]>('/rest/v1/support_cases', { case_type: 'dispute', status: 'open', priority: 'medium', subject: `${PREFIX} case`, created_by: adminProfileId, booking_id: bookingA, customer_id: c.id });
    fixtures.caseIds.push(cs.id as string);
    expect((await intentOn(pathA)).state).toBe('held');
    expect((await intentOn(pathB)).state).toBe('planned');
    // Move the case A → B.
    await svcPatch(`/rest/v1/support_cases?id=eq.${cs.id}`, { booking_id: bookingB });
    const caseHolds = await api.getRows<Row>(`/rest/v1/legal_holds?case_id=eq.${cs.id}&order=placed_at.asc`);
    expect(caseHolds.map((h) => [h.booking_id, h.released_at !== null, h.release_note])).toEqual([[bookingA, true, 'case reassigned'], [bookingB, false, null]]);
    expect(await intentOn(pathA)).toMatchObject({ state: 'held', hold_id: legal.hold_id }); // still protected by the legal hold
    expect(await intentOn(pathB)).toMatchObject({ state: 'held', hold_id: caseHolds[1].id });
    await worker();
    expect(await objectExists(pathA)).toBe(true);
    expect(await objectExists(pathB)).toBe(true);
    // Close the case: B is released; A stays held by its own hold.
    await svcPatch(`/rest/v1/support_cases?id=eq.${cs.id}`, { status: 'closed' });
    expect((await api.getRows<Row>(`/rest/v1/legal_holds?case_id=eq.${cs.id}&released_at=is.null`)).length).toBe(0);
    expect((await intentOn(pathB)).state).toBe('planned');
    expect((await intentOn(pathA)).state).toBe('held');
    await worker();
    expect(await objectExists(pathB)).toBe(false);
    expect(await objectExists(pathA)).toBe(true);
    await api.rpc('release_hold', { p_hold: legal.hold_id, p_released_by: null, p_note: 'qa' });
    await worker();
    expect(await ownIntentStates(deletion.id as string)).toEqual({ 'verified:removed': 2 });
  });

  // ── C4 concurrency ────────────────────────────────────────────────────────────────────────
  test('C4 two concurrent worker invocations over 20 intents: each processed once (per-deletion accounting), none to the operator; an expired-lease destroying intent is resumed', async () => {
    test.setTimeout(5 * 60 * 1000);
    const { paths, deletion } = await deleteCustomerWithPhotos(20);
    const [a, b] = await Promise.all([worker(), worker()]);
    expect(a.status).toBe(200); expect(b.status).toBe(200);
    expect(await ownIntentStates(deletion.id as string)).toEqual({ 'verified:removed': 20 });
    for (const path of paths) expect(await objectExists(path)).toBe(false);
    const intents = await intentsOf(deletion.id as string);
    await svcPatch(`/rest/v1/deletion_photo_intents?id=eq.${intents[0].id}`, { state: 'destroying', lease_id: crypto.randomUUID(), leased_until: past(20) });
    await worker();
    expect((await intentsOf(deletion.id as string))[0]).toMatchObject({ state: 'verified' });
  });

  // ── C5 auth ordering ──────────────────────────────────────────────────────────────────────
  test('C5a platform fact U4 (recorded): deleting an identity that still owns an object, then eventual Auth deletion once the object is gone', async () => {
    const c = await createSubject('customer');
    const p = await createSubject('provider');
    const bookingId = await seedCompletedBooking(c.id, p.id);
    const path = await uploadPhoto(c, bookingId, 'issue');
    const initial = await deleteViaFunction(c);
    test.info().annotations.push({ type: 'U4', description: `auth initially ${initial.authInitially} (HTTP ${initial.status})` });
    const deletion = await deletionRow(c.id);
    await worker();
    expect(await objectExists(path)).toBe(false);
    await ensureAuthDeleted(c, deletion.id as string);
  });

  test('C5b held object + dependency-class refusal → operator immediately; no further Auth call', async () => {
    const { c, bookingId, deletion, initial } = await deleteCustomerWithPhotos(1);
    const hold = await api.rpc<Row>('apply_hold', { p_scope: 'booking', p_booking: bookingId, p_user: null, p_source: 'legal', p_reference: `${PREFIX}-keep`, p_case_id: null, p_placed_by: null });
    fixtures.holdIds.push(hold.hold_id as string);
    await openSettling(deletion.id as string);
    await worker();
    expect((await deletionRow(c.id)).cleanup_state).toBe('provisional');
    let observedPlatformRefusal = false;
    if (initial.authInitially === 'pending_retry') {
      // REAL platform refusal path: the worker retries while only a held object remains.
      await dueAuthRetry(deletion.id as string);
      await worker();
      const d = await deletionRow(c.id);
      observedPlatformRefusal = d.auth_state === 'needs_operator';
      test.info().annotations.push({ type: 'U4', description: `retry while held → auth_state=${d.auth_state} class=${d.auth_last_error_class}` });
    }
    if (!observedPlatformRefusal) {
      // SIMULATED refusal, clearly labelled: the identity is already gone or the platform did not
      // refuse; the escalation RULE is exercised through the routine the worker calls.
      const lease = crypto.randomUUID();
      await svcPatch(`/rest/v1/account_deletions?id=eq.${deletion.id}`, { auth_state: 'pending_retry', auth_lease_id: lease, auth_leased_until: future(10) });
      const rec = await api.rpc<Row>('record_auth_result', { p_deletion: deletion.id, p_lease: lease, p_result: 'dependency', p_detail: 'qa: SIMULATED platform refusal' });
      expect(rec).toMatchObject({ recorded: true, auth_state: 'needs_operator' });
      test.info().annotations.push({ type: 'simulated', description: 'C5b escalation exercised through record_auth_result (no real platform refusal observed)' });
    }
    const attempts = (await deletionRow(c.id)).auth_attempts;
    await worker();
    expect(await deletionRow(c.id)).toMatchObject({ auth_state: 'needs_operator', auth_last_error_class: 'dependency', auth_attempts: attempts });
  });

  test('C5c "user not found" on retry counts as deleted (zero photos, account lease, no intent row)', async () => {
    const c = await createSubject('customer');
    const initial = await deleteViaFunction(c);
    const deletion = await deletionRow(c.id);
    expect(await api.count('deletion_photo_intents', `&account_deletion_id=eq.${deletion.id}`)).toBe(0);
    await ensureAuthDeleted(c, deletion.id as string); // establishes the identity is gone (either initial outcome)
    void initial;
    await svcPatch(`/rest/v1/account_deletions?id=eq.${deletion.id}`, { auth_state: 'pending_retry', auth_next_attempt_at: past(1) });
    await worker();
    expect((await deletionRow(c.id)).auth_state).toBe('deleted');
  });

  test('C5d a not_started account (crash before the auth step) is recovered by the worker after the grace period', async () => {
    const c = await createSubject('customer');
    const res = await api.rpc<Row>('delete_account', { p_user: c.id }); // database phase only, as the function does before it crashed
    expect(res.status).toBe('pending_auth_delete');
    const deletion = await deletionRow(c.id);
    expect(deletion.auth_state).toBe('not_started');
    await worker();
    expect((await deletionRow(c.id)).auth_state).toBe('not_started'); // inside the grace period
    await svcPatch(`/rest/v1/account_deletions?id=eq.${deletion.id}`, { db_completed_at: past(3) });
    await worker();
    expect(await deletionRow(c.id)).toMatchObject({ auth_state: 'deleted', status: 'deleted' });
    expect(await api.authUserExists(c.id)).toBe(false);
  });

  // ── C6 replacement safety ─────────────────────────────────────────────────────────────────
  test('C6a retired VERIFIED path (object absent): an authorised counterparty cannot upload, copy, upsert or move onto it, while a fresh path under the same booking works as a control', async () => {
    const { p, bookingId, paths, deletion } = await deleteCustomerWithPhotos(1);
    const retired = paths[0];
    await worker();
    expect(await ownIntentStates(deletion.id as string)).toEqual({ 'verified:removed': 1 });
    expect(await objectExists(retired)).toBe(false); // nothing at the path: "already exists" cannot be the reason
    const theirs = await uploadPhoto(p, bookingId, 'completion'); // control: the provider is authorised on this booking
    expect(await uploadAs(p.token, retired)).toBeGreaterThanOrEqual(400);
    expect(await uploadAs(p.token, retired, { upsert: true })).toBeGreaterThanOrEqual(400);
    expect(await storageOp(p.token, 'copy', theirs, retired)).toBeGreaterThanOrEqual(400);
    expect(await storageOp(p.token, 'move', theirs, retired)).toBeGreaterThanOrEqual(400);
    expect(await objectExists(retired)).toBe(false);
    expect(await objectExists(theirs)).toBe(true);
    const fresh = `${bookingId}/${crypto.randomUUID()}.png`;
    expect(await uploadAs(p.token, fresh), 'control: fresh path allowed for the same caller').toBe(200);
    expect(await objectExists(fresh)).toBe(true);
  });

  test('C6b retired HELD path (object present): admin delete refused; a service-role replacement is detected as identity_mismatch and left untouched', async () => {
    const { c, p, bookingId, paths, deletion } = await deleteCustomerWithPhotos(1);
    const retired = paths[0];
    const hold = await api.rpc<Row>('apply_hold', { p_scope: 'user', p_booking: null, p_user: c.id, p_source: 'legal', p_reference: `${PREFIX}-c6`, p_case_id: null, p_placed_by: null });
    fixtures.holdIds.push(hold.hold_id as string);
    await worker();
    expect(await objectExists(retired)).toBe(true);
    const admin = qaAccount('admin');
    const adminToken = admin ? await signInAs(admin.email, admin.password) : null;
    if (adminToken) {
      const del = await removeAs(adminToken, retired);
      expect(del).toEqual({ status: 200, items: 0 });
      expect(await objectExists(retired)).toBe(true);
    } else {
      test.info().annotations.push({ type: 'NOT RUN', description: 'admin-JWT delete refusal on a retired path: QA_ADMIN credentials not configured' });
    }
    await api.rpc('release_hold', { p_hold: hold.hold_id, p_released_by: null, p_note: 'qa' });
    await api.removeObject(retired);
    expect(await objectExists(retired)).toBe(false);
    expect(await uploadAs(null, retired, { serviceRole: true })).toBe(200); // trusted-actor replacement
    const replacementEtag = await objectEtag(retired);
    await worker();
    const [intent] = await intentsOf(deletion.id as string);
    expect(intent).toMatchObject({ state: 'needs_operator', last_error_class: 'identity_mismatch' });
    expect(await objectEtag(retired)).toBe(replacementEtag);
    expect(await api.count('booking_photos', `&photo_url=eq.${encodeURIComponent(retired)}`)).toBe(1);
    expect(await uploadAs(p.token, `${bookingId}/${crypto.randomUUID()}.png`), 'counterparty fresh path still allowed').toBe(200);
  });
});
