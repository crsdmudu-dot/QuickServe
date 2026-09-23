// delete-account — self-service account deletion (customer and provider).
//
// SECURITY MODEL
//   * The target identity comes ONLY from the verified bearer token (`auth.getUser()`). The request
//     body carries no user id and none is accepted; deleting another user is structurally
//     impossible rather than merely forbidden.
//   * The caller must re-prove the credential: the current password is verified server-side with
//     the ANON client. The mobile app never receives, and this function never returns, a
//     service-role key or any session it creates while checking.
//   * Admin/support identities are refused (403). They are removed by operations.
//   * Credential checks are throttled per user (5 failures / 15 minutes) via a service-only SQL
//     function, so this endpoint cannot be used as a password oracle.
//   * Nothing personal is ever logged: no request bodies, passwords, tokens, emails or phones.
//
// TWO PHASES, BECAUSE THEY CANNOT SHARE A TRANSACTION
//   1. `public.delete_account(uid)` — one SECURITY DEFINER transaction that re-checks blockers,
//      writes the audit row, deletes disposable data and TOMBSTONES the profile (financial history
//      is retained and anonymised; see migration 0056). From this moment restrictive RLS denies the
//      identity every user-facing row, whatever happens next.
//   2. `auth.admin.deleteUser(uid)` — removes the auth identity and every session. If it fails, the
//      response is 202 `pending_auth_delete`; the user is already locked out at the data layer and
//      a retry of this endpoint completes the job idempotently.
import { createClient } from 'jsr:@supabase/supabase-js@2';

type Body = { confirmation?: unknown; password?: unknown };

const CONFIRMATION = 'DELETE';
const BAN_DURATION = '876600h'; // ~100 years: belt-and-braces if deleteUser fails after tombstoning

function json(obj: unknown, status = 200): Response {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return json({ ok: false, error: 'Method not allowed.' }, 405);

  try {
    const authHeader = req.headers.get('Authorization') ?? '';
    if (!authHeader.toLowerCase().startsWith('bearer ')) {
      return json({ ok: false, error: 'Unauthorized.' }, 401);
    }

    let body: Body;
    try {
      body = (await req.json()) as Body;
    } catch {
      return json({ ok: false, error: 'Invalid request.' }, 400);
    }
    const confirmation = typeof body.confirmation === 'string' ? body.confirmation : '';
    const password = typeof body.password === 'string' ? body.password : '';
    if (confirmation !== CONFIRMATION) {
      return json({ ok: false, error: 'Type DELETE to confirm.' }, 400);
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    // ── Identity: from the token, never from the body ────────────────────────────────────
    const caller = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const {
      data: { user },
    } = await caller.auth.getUser();
    if (!user) return json({ ok: false, error: 'Unauthorized.' }, 401);
    const uid = user.id;

    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // ── Role: admins are never self-deleted ───────────────────────────────────────────────
    const { data: profile } = await admin
      .from('profiles')
      .select('role, deletion_status')
      .eq('id', uid)
      .maybeSingle();
    if (profile?.role === 'admin') {
      return json({ ok: false, error: 'Admin accounts cannot be deleted from the app.' }, 403);
    }

    // ── Idempotent re-entry: already tombstoned → skip the credential check and finish ────
    // The credential was proven when the tombstone was written; re-verifying would trap a user
    // whose auth row failed to delete but whose password can no longer be checked.
    const alreadyTombstoned = profile?.deletion_status === 'pending_auth_delete';

    if (!alreadyTombstoned) {
      // ── Identity type: only password identities can re-prove a credential here ─────────
      // The app signs users up with email + password only. If a non-password identity ever
      // exists, refuse EXPLICITLY with a routable reason instead of failing silently.
      const identities = (user.identities ?? []).map((i: { provider: string }) => i.provider);
      const hasPassword = identities.includes('email') && !!user.email;
      if (!hasPassword) {
        return json(
          { ok: false, error: 'unsupported_identity', status: 'unsupported_identity' },
          400,
        );
      }
      if (!password) return json({ ok: false, error: 'Enter your password.' }, 400);

      // ── Throttle BEFORE touching the credential ───────────────────────────────────────
      const { data: gate } = await admin.rpc('throttle_account_deletion', {
        p_user: uid,
        p_outcome: 'check',
      });
      if (gate && gate.allowed === false) {
        return json(
          { ok: false, error: 'Too many attempts. Try again later.', retry_after_seconds: gate.retry_after_seconds },
          429,
        );
      }

      // ── Credential re-proof, server-side, anon client. The session it yields is discarded.
      const verifier = createClient(supabaseUrl, anonKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const { data: proof, error: proofError } = await verifier.auth.signInWithPassword({
        email: user.email as string,
        password,
      });
      if (proofError || proof?.user?.id !== uid) {
        await admin.rpc('throttle_account_deletion', { p_user: uid, p_outcome: 'failure' });
        return json({ ok: false, error: 'Incorrect password.' }, 401);
      }
      await admin.rpc('throttle_account_deletion', { p_user: uid, p_outcome: 'success' });
    }

    // ── Phase 1: database (one transaction, blockers re-checked inside) ──────────────────
    const { data: result, error: dbError } = await admin.rpc('delete_account', { p_user: uid });
    if (dbError) {
      return json({ ok: false, error: 'Could not delete the account. Please try again.' }, 500);
    }
    const status = (result as { status?: string } | null)?.status;
    if (status === 'blocked') {
      return json(
        { ok: false, status: 'blocked', blockers: (result as { blockers?: string[] }).blockers ?? [] },
        409,
      );
    }
    if (status === 'deleted') {
      return json({ ok: true, status: 'deleted' });
    }
    if (status !== 'pending_auth_delete' && status !== 'not_found') {
      return json({ ok: false, error: 'Could not delete the account. Please try again.' }, 500);
    }

    // ── Phase 2: auth identity ───────────────────────────────────────────────────────────
    // Ban first so that even if deleteUser fails, refresh and sign-in are impossible.
    await admin.auth.admin.updateUserById(uid, { ban_duration: BAN_DURATION }).catch(() => {});
    const { error: authError } = await admin.auth.admin.deleteUser(uid);
    if (authError) {
      await admin.rpc('record_auth_deletion_failure', { p_user: uid });
      return json({ ok: true, status: 'pending_auth_delete' }, 202);
    }
    await admin.rpc('complete_account_deletion', { p_user: uid });
    return json({ ok: true, status: 'deleted' });
  } catch {
    // Deliberately no detail: nothing about the request may reach the logs.
    return json({ ok: false, error: 'Unexpected error.' }, 500);
  }
});
