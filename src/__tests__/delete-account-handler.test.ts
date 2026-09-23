/**
 * delete-account-handler.test.ts — BEHAVIOURAL tests for the delete-account decision flow.
 *
 * These run the real `handleDeleteAccount` control flow against recording fakes. That is the
 * difference between this file and `delete-account-function-guard.test.ts`: the guard file asserts
 * on source TEXT, which cannot distinguish a branch that runs from one that is dead, nor show what
 * a function abstains from doing. Here every call the handler makes is recorded, so the ABSENCE of
 * a destructive call is itself assertable.
 *
 * The defect that motivated the profile gate: the lookup discarded its error
 * (`const { data: profile }`), so an unreadable profile and an absent profile both surfaced as
 * `null`. `profile?.role === 'admin'` was then false and execution continued — the admin refusal
 * degraded OPEN on any read failure, and a profile-less identity could still be banned and
 * auth-deleted. Both paths must now stop before anything destructive happens.
 */
import {
  handleDeleteAccount,
  type AdminClient,
  type AuthUser,
  type Deps,
  type HandlerRequest,
  type ProfileRow,
} from '../../supabase/functions/delete-account/handler';

/** Every call that changes state, ends a session, or spends a credential attempt. */
const DESTRUCTIVE = [
  'rpc:delete_account',
  'rpc:complete_account_deletion',
  'rpc:record_auth_deletion_failure',
  'auth.admin.updateUserById',
  'auth.admin.deleteUser',
  'signInWithPassword',
] as const;

const UID = '11111111-1111-4111-8111-111111111111';

type Recorded = string[];

type FakeOptions = {
  user?: AuthUser | null;
  profile?: ProfileRow | null;
  profileError?: unknown;
  rpcResults?: Record<string, { data?: unknown; error?: unknown }>;
  signInResult?: { data: { user?: { id?: string } | null } | null; error: unknown };
  deleteUserError?: unknown;
};

function makeDeps(options: FakeOptions): { deps: Deps; calls: Recorded } {
  const calls: Recorded = [];
  const user =
    options.user === undefined
      ? ({ id: UID, email: 'person@example.test', identities: [{ provider: 'email' }] } as AuthUser)
      : options.user;

  const admin: AdminClient = {
    from: (table: string) => ({
      select: (columns: string) => ({
        eq: (column: string, value: string) => ({
          maybeSingle: async () => {
            calls.push(`from:${table}.select(${columns}).eq(${column},${value})`);
            return { data: options.profile ?? null, error: options.profileError ?? null };
          },
        }),
      }),
    }),
    rpc: async (fn: string, args: Record<string, unknown>) => {
      const outcome = typeof args.p_outcome === 'string' ? `:${args.p_outcome}` : '';
      calls.push(`rpc:${fn}${outcome}`);
      const configured = options.rpcResults?.[fn];
      return { data: configured?.data ?? null, error: configured?.error ?? null };
    },
    auth: {
      admin: {
        updateUserById: async (uid: string) => {
          calls.push('auth.admin.updateUserById');
          return { uid };
        },
        deleteUser: async () => {
          calls.push('auth.admin.deleteUser');
          return { error: options.deleteUserError ?? null };
        },
      },
    },
  };

  const deps: Deps = {
    caller: () => ({
      auth: {
        getUser: async () => {
          calls.push('getUser');
          return { data: { user } };
        },
      },
    }),
    admin,
    verifier: () => ({
      auth: {
        signInWithPassword: async () => {
          calls.push('signInWithPassword');
          return (
            options.signInResult ?? { data: { user: { id: UID } }, error: null }
          );
        },
      },
    }),
  };

  return { deps, calls };
}

function request(overrides: Partial<HandlerRequest> = {}): HandlerRequest {
  return {
    method: 'POST',
    authHeader: 'Bearer token-value',
    json: async () => ({ confirmation: 'DELETE', password: 'correct-horse' }),
    ...overrides,
  };
}

/** Asserts that nothing on the destructive list was reached. */
function expectNothingDestructive(calls: Recorded) {
  const hit = calls.filter((c) => DESTRUCTIVE.some((d) => c === d || c.startsWith(`${d}:`)));
  expect(hit).toEqual([]);
}

/**
 * The four categories a refused request must not reach, asserted by name so a reader can see each
 * one covered rather than trusting a single aggregate.
 */
function expectNoPasswordVerification(calls: Recorded) {
  expect(calls).not.toContain('signInWithPassword');
  expect(calls.filter((c) => c.startsWith('rpc:throttle_account_deletion'))).toEqual([]);
}
function expectNoDataMutation(calls: Recorded) {
  expect(calls).not.toContain('rpc:delete_account');
  expect(calls).not.toContain('rpc:complete_account_deletion');
  expect(calls).not.toContain('rpc:record_auth_deletion_failure');
}
function expectNoBan(calls: Recorded) {
  expect(calls).not.toContain('auth.admin.updateUserById');
}
function expectNoAuthDeletion(calls: Recorded) {
  expect(calls).not.toContain('auth.admin.deleteUser');
}
/** All four, for a request that must change nothing at all. */
function expectFullyInert(calls: Recorded) {
  expectNoPasswordVerification(calls);
  expectNoDataMutation(calls);
  expectNoBan(calls);
  expectNoAuthDeletion(calls);
  expectNothingDestructive(calls);
}

// ---------------------------------------------------------------------------
// The profile gate — the reason this file exists
// ---------------------------------------------------------------------------

describe('profile gate: an unreadable profile is refused and changes nothing', () => {
  const CAUSES: [string, unknown][] = [
    ['a missing column', { code: '42703', message: 'column profiles.deletion_status does not exist' }],
    ['a missing relation', { code: '42P01', message: 'relation "profiles" does not exist' }],
    ['an RLS denial', { code: '42501', message: 'permission denied for table profiles' }],
    ['a transport failure', { message: 'fetch failed' }],
  ];

  it.each(CAUSES)('refuses with 500 and stays fully inert on %s', async (_label, profileError) => {
    const { deps, calls } = makeDeps({ profile: null, profileError });

    const res = await handleDeleteAccount(request(), deps);

    expect(res.status).toBe(500);
    expect(res.body.ok).toBe(false);
    expectFullyInert(calls);
  });

  it('reaches no password verification', async () => {
    const { deps, calls } = makeDeps({ profileError: { message: 'fetch failed' } });
    await handleDeleteAccount(request(), deps);
    expectNoPasswordVerification(calls);
  });

  it('mutates no data', async () => {
    const { deps, calls } = makeDeps({ profileError: { message: 'fetch failed' } });
    await handleDeleteAccount(request(), deps);
    expectNoDataMutation(calls);
  });

  it('bans nobody and deletes no auth identity', async () => {
    const { deps, calls } = makeDeps({ profileError: { message: 'fetch failed' } });
    await handleDeleteAccount(request(), deps);
    expectNoBan(calls);
    expectNoAuthDeletion(calls);
  });

  it('stops at the profile read, so the read is the only call made', async () => {
    const { deps, calls } = makeDeps({ profileError: { message: 'fetch failed' } });
    await handleDeleteAccount(request(), deps);
    expect(calls).toEqual(['getUser', 'from:profiles.select(role, deletion_status).eq(id,' + UID + ')']);
  });

  it('leaks no detail of the underlying failure', async () => {
    const { deps } = makeDeps({ profileError: { message: 'relation "profiles" does not exist' } });
    const res = await handleDeleteAccount(request(), deps);
    expect(JSON.stringify(res.body)).not.toMatch(/relation|does not exist|42P01/i);
  });
});

describe('profile gate: a missing profile is refused and changes nothing', () => {
  it('refuses with 403 and stays fully inert', async () => {
    const { deps, calls } = makeDeps({ profile: null, profileError: null });

    const res = await handleDeleteAccount(request(), deps);

    expect(res.status).toBe(403);
    expect(res.body.ok).toBe(false);
    expectFullyInert(calls);
  });

  it('reaches no password verification', async () => {
    const { deps, calls } = makeDeps({ profile: null });
    await handleDeleteAccount(request(), deps);
    expectNoPasswordVerification(calls);
  });

  it('mutates no data even when the database would answer not_found', async () => {
    // `delete_account` answering `not_found` is precisely the pre-fix path that walked on to the
    // ban and the auth deletion for a subject with no profile row.
    const { deps, calls } = makeDeps({
      profile: null,
      rpcResults: { delete_account: { data: { status: 'not_found' } } },
    });
    await handleDeleteAccount(request(), deps);
    expectNoDataMutation(calls);
  });

  it('bans nobody and deletes no auth identity, even on the not_found path', async () => {
    const { deps, calls } = makeDeps({
      profile: null,
      rpcResults: { delete_account: { data: { status: 'not_found' } } },
    });
    await handleDeleteAccount(request(), deps);
    expectNoBan(calls);
    expectNoAuthDeletion(calls);
  });

  it('stops at the profile read, so the read is the only call made', async () => {
    const { deps, calls } = makeDeps({ profile: null });
    await handleDeleteAccount(request(), deps);
    expect(calls).toEqual(['getUser', 'from:profiles.select(role, deletion_status).eq(id,' + UID + ')']);
  });
});

describe('profile gate: admins are refused before any credential spend', () => {
  it('returns 403 for an admin and makes no destructive call', async () => {
    const { deps, calls } = makeDeps({ profile: { role: 'admin', deletion_status: 'active' } });

    const res = await handleDeleteAccount(request(), deps);

    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/Admin accounts cannot be deleted/i);
    expectNothingDestructive(calls);
  });
});

// ---------------------------------------------------------------------------
// The retry path must survive the new gate
// ---------------------------------------------------------------------------

describe('pending_auth_delete retry still completes without re-proving the credential', () => {
  const tombstone: ProfileRow = { role: 'customer', deletion_status: 'pending_auth_delete' };

  it('skips the password check and finishes the auth deletion', async () => {
    const { deps, calls } = makeDeps({
      profile: tombstone,
      rpcResults: { delete_account: { data: { status: 'pending_auth_delete' } } },
    });

    const res = await handleDeleteAccount(request({ json: async () => ({ confirmation: 'DELETE' }) }), deps);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, status: 'deleted' });
    expect(calls).not.toContain('signInWithPassword');
    expect(calls).toContain('rpc:delete_account');
    expect(calls).toContain('auth.admin.deleteUser');
    expect(calls).toContain('rpc:complete_account_deletion');
  });

  it('reports 202 and records the failure when the auth deletion fails again', async () => {
    const { deps, calls } = makeDeps({
      profile: tombstone,
      rpcResults: { delete_account: { data: { status: 'pending_auth_delete' } } },
      deleteUserError: { message: 'auth unavailable' },
    });

    const res = await handleDeleteAccount(request(), deps);

    expect(res.status).toBe(202);
    expect(res.body).toEqual({ ok: true, status: 'pending_auth_delete' });
    expect(calls).toContain('rpc:record_auth_deletion_failure');
    expect(calls).not.toContain('rpc:complete_account_deletion');
  });
});

// ---------------------------------------------------------------------------
// Surrounding behaviour, so the gate is not proved in isolation
// ---------------------------------------------------------------------------

describe('normal deletion path', () => {
  const customer: ProfileRow = { role: 'customer', deletion_status: 'active' };

  it('verifies the password, tombstones, bans, then deletes the identity', async () => {
    const { deps, calls } = makeDeps({
      profile: customer,
      rpcResults: { delete_account: { data: { status: 'pending_auth_delete' } } },
    });

    const res = await handleDeleteAccount(request(), deps);

    expect(res.body).toEqual({ ok: true, status: 'deleted' });
    expect(calls.indexOf('signInWithPassword')).toBeLessThan(calls.indexOf('rpc:delete_account'));
    expect(calls.indexOf('rpc:delete_account')).toBeLessThan(calls.indexOf('auth.admin.deleteUser'));
    expect(calls.indexOf('auth.admin.updateUserById')).toBeLessThan(
      calls.indexOf('auth.admin.deleteUser'),
    );
  });

  it('refuses a wrong password without tombstoning, banning or deleting', async () => {
    const { deps, calls } = makeDeps({
      profile: customer,
      signInResult: { data: null, error: { message: 'invalid' } },
    });

    const res = await handleDeleteAccount(request(), deps);

    expect(res.status).toBe(401);
    expect(calls).toContain('rpc:throttle_account_deletion:failure');
    expect(calls).not.toContain('rpc:delete_account');
    expect(calls).not.toContain('auth.admin.updateUserById');
    expect(calls).not.toContain('auth.admin.deleteUser');
  });

  it('returns blockers without touching the auth identity', async () => {
    const { deps, calls } = makeDeps({
      profile: customer,
      rpcResults: { delete_account: { data: { status: 'blocked', blockers: ['open_support_case'] } } },
    });

    const res = await handleDeleteAccount(request(), deps);

    expect(res.status).toBe(409);
    expect(res.body).toEqual({ ok: false, status: 'blocked', blockers: ['open_support_case'] });
    expect(calls).not.toContain('auth.admin.updateUserById');
    expect(calls).not.toContain('auth.admin.deleteUser');
  });

  it('stops at the database error without banning or deleting', async () => {
    const { deps, calls } = makeDeps({
      profile: customer,
      rpcResults: { delete_account: { error: { message: 'function does not exist' } } },
    });

    const res = await handleDeleteAccount(request(), deps);

    expect(res.status).toBe(500);
    expect(calls).not.toContain('auth.admin.updateUserById');
    expect(calls).not.toContain('auth.admin.deleteUser');
  });

  it('honours the throttle before spending a credential attempt', async () => {
    const { deps, calls } = makeDeps({
      profile: customer,
      rpcResults: {
        throttle_account_deletion: { data: { allowed: false, retry_after_seconds: 900 } },
      },
    });

    const res = await handleDeleteAccount(request(), deps);

    expect(res.status).toBe(429);
    expect(calls).not.toContain('signInWithPassword');
    expectNothingDestructive(calls);
  });
});

describe('request envelope', () => {
  it('rejects a non-POST method before reading anything', async () => {
    const { deps, calls } = makeDeps({});
    const res = await handleDeleteAccount(request({ method: 'GET' }), deps);
    expect(res.status).toBe(405);
    expect(calls).toEqual([]);
  });

  it('rejects a missing bearer token before reading anything', async () => {
    const { deps, calls } = makeDeps({});
    const res = await handleDeleteAccount(request({ authHeader: null }), deps);
    expect(res.status).toBe(401);
    expect(calls).toEqual([]);
  });

  it('rejects a wrong confirmation word before resolving identity', async () => {
    const { deps, calls } = makeDeps({});
    const res = await handleDeleteAccount(
      request({ json: async () => ({ confirmation: 'delete', password: 'x' }) }),
      deps,
    );
    expect(res.status).toBe(400);
    expect(calls).toEqual([]);
  });

  it('rejects an unauthenticated token without touching the database', async () => {
    const { deps, calls } = makeDeps({ user: null });
    const res = await handleDeleteAccount(request(), deps);
    expect(res.status).toBe(401);
    expect(calls).toEqual(['getUser']);
  });
});
