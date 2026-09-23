// handler.ts — the delete-account decision flow, free of Deno and of the Supabase SDK.
//
// WHY THIS FILE EXISTS. `index.ts` is Deno: it imports from `jsr:` and reads `Deno.env`, so it is
// excluded from `tsconfig.json` and unreachable from Jest. That left the function's security
// behaviour provable only by asserting on its SOURCE TEXT, which cannot show what the code DOES —
// a source guard passes just as happily when a branch is unreachable or its result ignored.
//
// Everything the function decides now lives here, behind injected dependencies, so the real
// control flow can be exercised against recording fakes and the ABSENCE of a destructive call can
// be asserted. `index.ts` keeps only the Deno wiring: env, client construction, Request/Response.
//
// SECURITY MODEL (unchanged; see index.ts for the full narrative)
//   * Identity comes only from the verified bearer token. No user id is accepted from the body.
//   * The credential is re-proved server-side with the anon client, throttled per user.
//   * Admin identities are refused. Tombstone first, auth deletion second.
//
// PROFILE GATE. The profile lookup previously discarded its error: `const { data: profile }` threw
// the error away, so an unreadable profile (missing column, RLS change, transport failure) and a
// genuinely absent profile both arrived as `null`. `profile?.role === 'admin'` was then false and
// the flow continued — the admin refusal degraded OPEN on any read failure, and a profile-less
// identity could still reach the ban and the auth deletion. Both are now refused before any
// credential check, tombstone, ban or auth deletion happens.

export type AuthUser = {
  id: string;
  email?: string | null;
  identities?: { provider: string }[] | null;
};

export type ProfileRow = { role?: string | null; deletion_status?: string | null };

export type CallerClient = {
  auth: { getUser(): Promise<{ data: { user: AuthUser | null } }> };
};

export type VerifierClient = {
  auth: {
    signInWithPassword(credentials: { email: string; password: string }): Promise<{
      data: { user?: { id?: string } | null } | null;
      error: unknown;
    }>;
  };
};

export type AdminClient = {
  from(table: string): {
    select(columns: string): {
      eq(
        column: string,
        value: string,
      ): { maybeSingle(): Promise<{ data: ProfileRow | null; error: unknown }> };
    };
  };
  rpc(fn: string, args: Record<string, unknown>): Promise<{ data: unknown; error: unknown }>;
  auth: {
    admin: {
      updateUserById(uid: string, attrs: Record<string, unknown>): Promise<unknown>;
      deleteUser(uid: string): Promise<{ error: unknown }>;
    };
  };
};

export type Deps = {
  /** Anon client carrying the caller's Authorization header; used only to resolve identity. */
  caller(authHeader: string): CallerClient;
  /** Service-role client. Every privileged action goes through this one. */
  admin: AdminClient;
  /** Fresh anon client for the password re-proof. The session it yields is discarded. */
  verifier(): VerifierClient;
};

export type HandlerRequest = {
  method: string;
  authHeader: string | null;
  json(): Promise<unknown>;
};

export type HandlerResult = { status: number; body: Record<string, unknown> };

export const CONFIRMATION = 'DELETE';
/** ~100 years: belt-and-braces if deleteUser fails after tombstoning. */
export const BAN_DURATION = '876600h';

const GENERIC_FAILURE = 'Could not delete the account. Please try again.';

function result(body: Record<string, unknown>, status = 200): HandlerResult {
  return { status, body };
}

export async function handleDeleteAccount(
  req: HandlerRequest,
  deps: Deps,
): Promise<HandlerResult> {
  if (req.method !== 'POST') return result({ ok: false, error: 'Method not allowed.' }, 405);

  try {
    const authHeader = req.authHeader ?? '';
    if (!authHeader.toLowerCase().startsWith('bearer ')) {
      return result({ ok: false, error: 'Unauthorized.' }, 401);
    }

    let body: { confirmation?: unknown; password?: unknown };
    try {
      body = ((await req.json()) ?? {}) as { confirmation?: unknown; password?: unknown };
    } catch {
      return result({ ok: false, error: 'Invalid request.' }, 400);
    }
    const confirmation = typeof body.confirmation === 'string' ? body.confirmation : '';
    const password = typeof body.password === 'string' ? body.password : '';
    if (confirmation !== CONFIRMATION) {
      return result({ ok: false, error: 'Type DELETE to confirm.' }, 400);
    }

    // ── Identity: from the token, never from the body ────────────────────────────────────
    const {
      data: { user },
    } = await deps.caller(authHeader).auth.getUser();
    if (!user) return result({ ok: false, error: 'Unauthorized.' }, 401);
    const uid = user.id;

    const admin = deps.admin;

    // ── Profile gate: fail CLOSED on an unreadable or absent profile ─────────────────────
    // Nothing destructive may run when we cannot positively establish the subject's role. An
    // error and a missing row are distinct causes with the same verdict: refuse, change nothing.
    const { data: profile, error: profileError } = await admin
      .from('profiles')
      .select('role, deletion_status')
      .eq('id', uid)
      .maybeSingle();

    if (profileError) {
      // The read itself failed. We cannot tell an admin from a customer, so we refuse.
      return result({ ok: false, error: GENERIC_FAILURE }, 500);
    }
    if (!profile) {
      // No profile row. A tombstoned account still HAS one (0056 keeps it as the referent), so a
      // legitimate pending_auth_delete retry never lands here. Refuse rather than ban and delete
      // an identity whose subject we cannot see.
      return result({ ok: false, error: GENERIC_FAILURE }, 403);
    }
    if (profile.role === 'admin') {
      return result({ ok: false, error: 'Admin accounts cannot be deleted from the app.' }, 403);
    }

    // ── Idempotent re-entry: already tombstoned → skip the credential check and finish ────
    // The credential was proven when the tombstone was written; re-verifying would trap a user
    // whose auth row failed to delete but whose password can no longer be checked.
    const alreadyTombstoned = profile.deletion_status === 'pending_auth_delete';

    if (!alreadyTombstoned) {
      // ── Identity type: only password identities can re-prove a credential here ─────────
      const identities = (user.identities ?? []).map((i: { provider: string }) => i.provider);
      const hasPassword = identities.includes('email') && !!user.email;
      if (!hasPassword) {
        return result(
          { ok: false, error: 'unsupported_identity', status: 'unsupported_identity' },
          400,
        );
      }
      if (!password) return result({ ok: false, error: 'Enter your password.' }, 400);

      // ── Throttle BEFORE touching the credential ───────────────────────────────────────
      const gateRes = await admin.rpc('throttle_account_deletion', {
        p_user: uid,
        p_outcome: 'check',
      });
      const gate = gateRes.data as { allowed?: boolean; retry_after_seconds?: number } | null;
      if (gate && gate.allowed === false) {
        return result(
          {
            ok: false,
            error: 'Too many attempts. Try again later.',
            retry_after_seconds: gate.retry_after_seconds,
          },
          429,
        );
      }

      // ── Credential re-proof, server-side, anon client. The session it yields is discarded.
      const { data: proof, error: proofError } = await deps
        .verifier()
        .auth.signInWithPassword({ email: user.email as string, password });
      if (proofError || proof?.user?.id !== uid) {
        await admin.rpc('throttle_account_deletion', { p_user: uid, p_outcome: 'failure' });
        return result({ ok: false, error: 'Incorrect password.' }, 401);
      }
      await admin.rpc('throttle_account_deletion', { p_user: uid, p_outcome: 'success' });
    }

    // ── Phase 1: database (one transaction, blockers re-checked inside) ──────────────────
    const { data: rpcData, error: dbError } = await admin.rpc('delete_account', { p_user: uid });
    if (dbError) {
      return result({ ok: false, error: GENERIC_FAILURE }, 500);
    }
    const payload = rpcData as { status?: string; blockers?: string[] } | null;
    const status = payload?.status;
    if (status === 'blocked') {
      return result({ ok: false, status: 'blocked', blockers: payload?.blockers ?? [] }, 409);
    }
    if (status === 'deleted') {
      return result({ ok: true, status: 'deleted' });
    }
    // `not_found` is retained defensively. The profile gate above already refuses a subject with
    // no profile, so the database should never reach this answer through this path.
    if (status !== 'pending_auth_delete' && status !== 'not_found') {
      return result({ ok: false, error: GENERIC_FAILURE }, 500);
    }

    // ── Phase 2: auth identity ───────────────────────────────────────────────────────────
    // Ban first so that even if deleteUser fails, refresh and sign-in are impossible.
    await admin.auth.admin.updateUserById(uid, { ban_duration: BAN_DURATION }).catch(() => {});
    const { error: authError } = await admin.auth.admin.deleteUser(uid);
    if (authError) {
      await admin.rpc('record_auth_deletion_failure', { p_user: uid });
      return result({ ok: true, status: 'pending_auth_delete' }, 202);
    }
    await admin.rpc('complete_account_deletion', { p_user: uid });
    return result({ ok: true, status: 'deleted' });
  } catch {
    // Deliberately no detail: nothing about the request may reach the logs.
    return result({ ok: false, error: 'Unexpected error.' }, 500);
  }
}
