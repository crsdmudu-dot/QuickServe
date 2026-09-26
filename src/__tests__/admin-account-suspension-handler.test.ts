/**
 * admin-account-suspension-handler.test.ts — BEHAVIOURAL tests for the suspension Edge Function (F5.6b).
 *
 * These run the real `handleSuspension` control flow against recording fakes, so what the function does NOT do is
 * assertable: no ban for a refused request, no target read before the admin gate, no admin id taken from the body.
 * `admin-account-suspension-function-guard.test.ts` pins the source shape (keys, logging, config).
 */
import {
  BAN_DURATION,
  UNBAN,
  corsHeaders,
  handleSuspension,
  parseAdminOrigin,
  type Deps,
  type HandlerRequest,
  type ProfileRow,
  type SuspensionRow,
} from '../../supabase/functions/admin-account-suspension/handler';

const ORIGIN = 'https://quickserve.zaka-crsd.workers.dev';
const ADMIN = '11111111-1111-4111-8111-111111111111';
const TARGET = '22222222-2222-4222-8222-222222222222';
const SUSPENSION = '33333333-3333-4333-8333-333333333333';
const REPORT = '44444444-4444-4444-8444-444444444444';

const ACTIVE_ADMIN: ProfileRow = { role: 'admin', approval_status: 'approved', deleted_at: null };
const CUSTOMER: ProfileRow = { role: 'customer', approval_status: null, deleted_at: null };

type Options = {
  user?: { id: string } | null;
  profiles?: Record<string, ProfileRow | null>;
  profileError?: Record<string, unknown>;
  rpc?: { data?: unknown; error?: unknown };
  latest?: SuspensionRow | null;
  latestError?: unknown;
  banOutcome?: unknown;
  banThrows?: boolean;
  recordError?: unknown;
  adminOrigin?: string | null;
};

function makeDeps(o: Options = {}) {
  const calls: string[] = [];
  const args: Record<string, unknown> = {};
  const profiles = o.profiles ?? { [ADMIN]: ACTIVE_ADMIN, [TARGET]: CUSTOMER };
  const deps: Deps = {
    adminOrigin: o.adminOrigin === undefined ? ORIGIN : o.adminOrigin,
    caller: () => ({
      getUser: async () => {
        calls.push('getUser');
        return { data: { user: o.user === undefined ? { id: ADMIN } : o.user } };
      },
      suspend: async (a) => {
        calls.push('rpc:admin_suspend_account');
        args.suspend = a;
        return { data: o.rpc?.data ?? SUSPENSION, error: o.rpc?.error ?? null };
      },
      lift: async (a) => {
        calls.push('rpc:admin_lift_account_suspension');
        args.lift = a;
        return { data: o.rpc?.data ?? SUSPENSION, error: o.rpc?.error ?? null };
      },
    }),
    service: {
      readProfile: async (uid) => {
        calls.push(`readProfile:${uid === ADMIN ? 'caller' : uid === TARGET ? 'target' : uid}`);
        const error = o.profileError?.[uid] ?? null;
        return { data: error ? null : (profiles[uid] ?? null), error };
      },
      readLatestSuspension: async () => {
        calls.push('readLatestSuspension');
        return { data: o.latest ?? null, error: o.latestError ?? null };
      },
      setBan: async (uid, duration) => {
        calls.push(`setBan:${duration}`);
        args.ban = { uid, duration };
        if (o.banThrows) throw new Error('network');
        return o.banOutcome ?? { data: { user: { id: uid } }, error: null };
      },
      recordBanState: async (id, state) => {
        calls.push(`record:${state}`);
        args.record = { id, state };
        return { error: o.recordError ?? null };
      },
    },
  };
  return { deps, calls, args };
}

function request(body: unknown = { action: 'suspend', user_id: TARGET, reason: 'Repeated abusive messages' }, over: Partial<HandlerRequest> = {}): HandlerRequest {
  return { method: 'POST', origin: ORIGIN, authHeader: 'Bearer admin-token', json: async () => body, ...over };
}

const touchesTarget = (calls: string[]) =>
  calls.filter((c) => c.startsWith('rpc:') || c.startsWith('setBan') || c.startsWith('record:') || c === 'readProfile:target' || c === 'readLatestSuspension');

// ── Origin configuration and CORS ─────────────────────────────────────────────────────────────────────
describe('ADMIN_ORIGIN and CORS', () => {
  it('accepts only an https origin without a path; a single trailing slash is tolerated', () => {
    expect(parseAdminOrigin(ORIGIN)).toBe(ORIGIN);
    expect(parseAdminOrigin(`  ${ORIGIN}/ `)).toBe(ORIGIN);
    for (const bad of [undefined, null, '', '*', 'http://quickserve.zaka-crsd.workers.dev', `${ORIGIN}/admin`, 'https://', 'quickserve.zaka-crsd.workers.dev', `${ORIGIN},https://evil.example`]) {
      expect(parseAdminOrigin(bad)).toBeNull();
    }
  });

  it('answers CORS only for the exact origin, never with a wildcard', () => {
    expect(corsHeaders(ORIGIN, ORIGIN)?.['Access-Control-Allow-Origin']).toBe(ORIGIN);
    expect(corsHeaders('https://evil.example', ORIGIN)).toBeNull();
    expect(corsHeaders(`${ORIGIN}.evil.example`, ORIGIN)).toBeNull();
    expect(corsHeaders(ORIGIN, null)).toBeNull();
    expect(corsHeaders(null, ORIGIN)).toBeNull();
  });

  it('a preflight from the admin web gets 204 with the exact origin', async () => {
    const { deps, calls } = makeDeps();
    const res = await handleSuspension(request(undefined, { method: 'OPTIONS', authHeader: null }), deps);
    expect(res.status).toBe(204);
    expect(res.headers['Access-Control-Allow-Origin']).toBe(ORIGIN);
    expect(res.headers['Access-Control-Allow-Methods']).toBe('POST, OPTIONS');
    expect(calls).toEqual([]);
  });

  it('refuses a preflight or a POST from any other origin, with no CORS headers, touching nothing', async () => {
    for (const method of ['OPTIONS', 'POST']) {
      const { deps, calls } = makeDeps();
      const res = await handleSuspension(request(undefined, { method, origin: 'https://evil.example' }), deps);
      expect(res.status).toBe(403);
      expect(res.headers['Access-Control-Allow-Origin']).toBeUndefined();
      expect(calls).toEqual([]);
    }
  });

  it('refuses every browser request while ADMIN_ORIGIN is unset (fails closed)', async () => {
    const { deps, calls } = makeDeps({ adminOrigin: null });
    const res = await handleSuspension(request(), deps);
    expect(res.status).toBe(403);
    expect(Object.keys(res.headers).some((h) => h.startsWith('Access-Control'))).toBe(false);
    expect(calls).toEqual([]);
  });

  it('never sends a wildcard origin on any response', async () => {
    const { deps } = makeDeps();
    for (const req of [request(), request(undefined, { method: 'OPTIONS' }), request({ action: 'nope' })]) {
      const res = await handleSuspension(req, deps);
      expect(Object.values(res.headers)).not.toContain('*');
    }
  });
});

// ── Request envelope and identity ─────────────────────────────────────────────────────────────────────
describe('envelope and identity', () => {
  it('rejects other methods, a missing bearer token and malformed bodies before resolving identity', async () => {
    const cases: [Partial<HandlerRequest>, unknown, number][] = [
      [{ method: 'GET' }, undefined, 405],
      [{ authHeader: null }, undefined, 401],
      [{ json: async () => { throw new Error('bad json'); } }, undefined, 400],
      [{}, { action: 'delete', user_id: TARGET }, 400],
      [{}, { action: 'suspend', user_id: 'not-a-uuid', reason: 'x' }, 400],
      [{}, { action: 'suspend', user_id: TARGET, reason: '   ' }, 400],
      [{}, { action: 'suspend', user_id: TARGET, reason: 'x'.repeat(501) }, 400],
      [{}, { action: 'lift', user_id: TARGET, note: 'x'.repeat(501) }, 400],
      [{}, { action: 'suspend', user_id: TARGET, reason: 'x', report_id: 'not-a-uuid' }, 400],
    ];
    for (const [over, body, status] of cases) {
      const { deps, calls } = makeDeps();
      const res = await handleSuspension(request(body, over), deps);
      expect(res.status).toBe(status);
      expect(calls).toEqual([]);
    }
  });

  it('rejects an unauthenticated token without reading or changing anything', async () => {
    const { deps, calls } = makeDeps({ user: null });
    const res = await handleSuspension(request(), deps);
    expect(res.status).toBe(401);
    expect(calls).toEqual(['getUser']);
  });
});

// ── The admin gate ────────────────────────────────────────────────────────────────────────────────────
describe('admin gate: fails closed before anything about the target is read or changed', () => {
  it.each([
    ['a customer', CUSTOMER, 403],
    ['an admin who is not approved', { role: 'admin', approval_status: 'pending', deleted_at: null }, 403],
    ['a deleted admin', { role: 'admin', approval_status: 'approved', deleted_at: '2026-09-01T00:00:00Z' }, 403],
    ['no profile at all', null, 403],
  ])('refuses %s', async (_label, profile, status) => {
    const { deps, calls } = makeDeps({ profiles: { [ADMIN]: profile as ProfileRow | null, [TARGET]: CUSTOMER } });
    const res = await handleSuspension(request(), deps);
    expect(res.status).toBe(status);
    expect(res.body).toEqual({ ok: false, error: 'not_allowed' });
    expect(touchesTarget(calls)).toEqual([]);
  });

  it('an unreadable caller profile is a generic 500 and touches nothing', async () => {
    const { deps, calls } = makeDeps({ profileError: { [ADMIN]: { message: 'connection reset' } } });
    const res = await handleSuspension(request(), deps);
    expect(res.status).toBe(500);
    expect(JSON.stringify(res.body)).not.toContain('connection reset');
    expect(touchesTarget(calls)).toEqual([]);
  });

  it('ignores any admin identity in the body: the database step gets only the target, reason and report', async () => {
    const { deps, args } = makeDeps();
    await handleSuspension(
      request({ action: 'suspend', user_id: TARGET, reason: 'Spam', report_id: REPORT, admin_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', p_admin: 'x', suspended_by: 'x' }),
      deps,
    );
    expect(args.suspend).toEqual({ p_user: TARGET, p_reason: 'Spam', p_report: REPORT });
  });
});

// ── Suspend ───────────────────────────────────────────────────────────────────────────────────────────
describe('suspend', () => {
  it('runs the database step with the admin token, then bans the target, then records the outcome', async () => {
    const { deps, calls, args } = makeDeps();
    const res = await handleSuspension(request(), deps);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, action: 'suspend', suspension_id: SUSPENSION, ban_state: 'banned', ban_state_recorded: true });
    expect(calls).toEqual(['getUser', 'readProfile:caller', 'readProfile:target', 'rpc:admin_suspend_account', `setBan:${BAN_DURATION}`, 'record:banned']);
    expect(args.ban).toEqual({ uid: TARGET, duration: BAN_DURATION });
    expect(args.record).toEqual({ id: SUSPENSION, state: 'banned' });
    expect(res.headers['Access-Control-Allow-Origin']).toBe(ORIGIN);
  });

  it.each([
    ['Admin only', 403, 'not_allowed'],
    ['already_suspended', 409, 'already_suspended'],
    ['user_not_suspendable', 409, 'user_not_suspendable'],
    ['user_deleted', 409, 'user_deleted'],
    ['user_not_found', 404, 'user_not_found'],
    ['invalid_reason', 400, 'invalid_reason'],
  ])('a database refusal "%s" maps to %i and bans nobody', async (message, status, code) => {
    const { deps, calls } = makeDeps({ rpc: { error: { message, code: 'P0001' } } });
    const res = await handleSuspension(request(), deps);
    expect(res.status).toBe(status);
    expect(res.body).toEqual({ ok: false, error: code });
    expect(calls.filter((c) => c.startsWith('setBan') || c.startsWith('record:'))).toEqual([]);
  });

  it('an unknown database error is a generic 500 with no detail, and bans nobody', async () => {
    const { deps, calls } = makeDeps({ rpc: { error: { message: 'relation "x" does not exist' } } });
    const res = await handleSuspension(request(), deps);
    expect(res.status).toBe(500);
    expect(JSON.stringify(res.body)).not.toContain('relation');
    expect(calls.filter((c) => c.startsWith('setBan'))).toEqual([]);
  });

  it('a malformed database answer (no suspension id) bans nobody', async () => {
    const { deps, calls } = makeDeps({ rpc: { data: { id: SUSPENSION } } });
    const res = await handleSuspension(request(), deps);
    expect(res.status).toBe(500);
    expect(calls.filter((c) => c.startsWith('setBan'))).toEqual([]);
  });

  it('a failed ban is recorded as failed and reported; the account stays suspended in the database', async () => {
    for (const o of [{ banOutcome: { data: null, error: { message: 'boom' } } }, { banThrows: true }]) {
      const { deps, args } = makeDeps(o);
      const res = await handleSuspension(request(), deps);
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ ok: true, ban_state: 'failed', ban_state_recorded: true });
      expect(args.record).toEqual({ id: SUSPENSION, state: 'failed' });
    }
  });

  it('reports when the outcome could not be recorded', async () => {
    const { deps } = makeDeps({ recordError: { message: 'x' } });
    const res = await handleSuspension(request(), deps);
    expect(res.body).toMatchObject({ ok: true, ban_state: 'banned', ban_state_recorded: false });
  });

  it('a missing target is 404 before any database step; an unreadable target is 500', async () => {
    const missing = makeDeps({ profiles: { [ADMIN]: ACTIVE_ADMIN } });
    expect((await handleSuspension(request(), missing.deps)).status).toBe(404);
    expect(missing.calls.filter((c) => c.startsWith('rpc:') || c.startsWith('setBan'))).toEqual([]);
    const unreadable = makeDeps({ profileError: { [TARGET]: { message: 'x' } } });
    expect((await handleSuspension(request(), unreadable.deps)).status).toBe(500);
    expect(unreadable.calls.filter((c) => c.startsWith('rpc:') || c.startsWith('setBan'))).toEqual([]);
  });
});

// ── Lift ──────────────────────────────────────────────────────────────────────────────────────────────
describe('lift', () => {
  const lift = (note?: string) => request({ action: 'lift', user_id: TARGET, ...(note === undefined ? {} : { note }) });

  it('lifts with the admin token, unbans, then records unbanned', async () => {
    const { deps, calls, args } = makeDeps();
    const res = await handleSuspension(lift('Appeal accepted'), deps);
    expect(res.body).toEqual({ ok: true, action: 'lift', suspension_id: SUSPENSION, ban_state: 'unbanned', ban_state_recorded: true });
    expect(calls).toEqual(['getUser', 'readProfile:caller', 'readProfile:target', 'rpc:admin_lift_account_suspension', `setBan:${UNBAN}`, 'record:unbanned']);
    expect(args.lift).toEqual({ p_user: TARGET, p_note: 'Appeal accepted' });
  });

  it('an empty note is sent as null', async () => {
    const { deps, args } = makeDeps();
    await handleSuspension(lift('   '), deps);
    expect(args.lift).toEqual({ p_user: TARGET, p_note: null });
  });

  it('never lifts or unbans a deleted account', async () => {
    const { deps, calls } = makeDeps({ profiles: { [ADMIN]: ACTIVE_ADMIN, [TARGET]: { ...CUSTOMER, deleted_at: '2026-09-20T00:00:00Z' } } });
    const res = await handleSuspension(lift(), deps);
    expect(res.status).toBe(409);
    expect(res.body).toEqual({ ok: false, error: 'user_deleted' });
    expect(calls.filter((c) => c.startsWith('rpc:') || c.startsWith('setBan') || c.startsWith('record:'))).toEqual([]);
  });

  it('a failed unban is recorded as failed and reported: the person stays unable to sign in until Retry succeeds', async () => {
    const { deps, calls, args } = makeDeps({ banOutcome: { data: null, error: { message: 'boom' } } });
    const res = await handleSuspension(lift(), deps);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, action: 'lift', suspension_id: SUSPENSION, ban_state: 'failed', ban_state_recorded: true });
    expect(calls).toEqual(['getUser', 'readProfile:caller', 'readProfile:target', 'rpc:admin_lift_account_suspension', `setBan:${UNBAN}`, 'record:failed']);
    expect(args.record).toEqual({ id: SUSPENSION, state: 'failed' });
  });

  it('not suspended: 409 and no unban', async () => {
    const { deps, calls } = makeDeps({ rpc: { error: { message: 'not_suspended', code: 'P0002' } } });
    const res = await handleSuspension(lift(), deps);
    expect(res.status).toBe(409);
    expect(calls.filter((c) => c.startsWith('setBan'))).toEqual([]);
  });
});

// ── Retry the Auth step ───────────────────────────────────────────────────────────────────────────────
describe('retry_ban', () => {
  const retry = request({ action: 'retry_ban', user_id: TARGET });

  it('re-applies the ban for an active suspension', async () => {
    const { deps, calls } = makeDeps({ latest: { id: SUSPENSION, lifted_at: null } });
    const res = await handleSuspension(retry, deps);
    expect(res.body).toMatchObject({ ok: true, action: 'retry_ban', ban_state: 'banned' });
    expect(calls).toEqual(['getUser', 'readProfile:caller', 'readProfile:target', 'readLatestSuspension', `setBan:${BAN_DURATION}`, 'record:banned']);
  });

  it('re-applies the unban after a lift', async () => {
    const { deps, calls } = makeDeps({ latest: { id: SUSPENSION, lifted_at: '2026-09-27T00:00:00Z' } });
    const res = await handleSuspension(retry, deps);
    expect(res.body).toMatchObject({ ok: true, ban_state: 'unbanned' });
    expect(calls).toContain(`setBan:${UNBAN}`);
  });

  it('never unbans a deleted account on retry', async () => {
    const { deps, calls } = makeDeps({
      latest: { id: SUSPENSION, lifted_at: '2026-09-27T00:00:00Z' },
      profiles: { [ADMIN]: ACTIVE_ADMIN, [TARGET]: { ...CUSTOMER, deleted_at: '2026-09-20T00:00:00Z' } },
    });
    const res = await handleSuspension(retry, deps);
    expect(res.status).toBe(409);
    expect(calls.filter((c) => c.startsWith('setBan'))).toEqual([]);
  });

  it('no suspension: 409; unreadable: 500; neither touches the Auth identity', async () => {
    const none = makeDeps({ latest: null });
    expect((await handleSuspension(retry, none.deps)).status).toBe(409);
    const broken = makeDeps({ latestError: { message: 'x' } });
    expect((await handleSuspension(retry, broken.deps)).status).toBe(500);
    for (const c of [none.calls, broken.calls]) expect(c.filter((x) => x.startsWith('setBan'))).toEqual([]);
  });

  it('is refused for non-admins like every action (the retry has no database-side admin check of its own)', async () => {
    const { deps, calls } = makeDeps({ profiles: { [ADMIN]: CUSTOMER, [TARGET]: CUSTOMER }, latest: { id: SUSPENSION, lifted_at: null } });
    const res = await handleSuspension(retry, deps);
    expect(res.status).toBe(403);
    expect(touchesTarget(calls)).toEqual([]);
  });
});

// ── Requests without an Origin (not from a browser) ───────────────────────────────────────────────────
describe('non-browser requests', () => {
  it('are still subject to the token and the admin gate, and get no CORS headers', async () => {
    const refused = makeDeps({ profiles: { [ADMIN]: CUSTOMER, [TARGET]: CUSTOMER } });
    const r1 = await handleSuspension(request(undefined, { origin: null }), refused.deps);
    expect(r1.status).toBe(403);
    expect(r1.headers['Access-Control-Allow-Origin']).toBeUndefined();
    const allowed = makeDeps();
    const r2 = await handleSuspension(request(undefined, { origin: null }), allowed.deps);
    expect(r2.status).toBe(200);
    expect(r2.headers['Access-Control-Allow-Origin']).toBeUndefined();
  });
});
