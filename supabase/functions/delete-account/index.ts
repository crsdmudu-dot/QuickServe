// delete-account — self-service account deletion (customer and provider).
//
// This file is the Deno EDGE: environment, Supabase client construction, and the Request/Response
// boundary. Every decision the function makes lives in `./handler.ts`, which imports nothing and
// touches no global, so the real control flow can be exercised in Jest against recording fakes.
// Keep it that way: logic added here is logic no test can reach.
//
// SECURITY MODEL
//   * The target identity comes ONLY from the verified bearer token (`auth.getUser()`). The request
//     body carries no user id and none is accepted; deleting another user is structurally
//     impossible rather than merely forbidden.
//   * The caller must re-prove the credential: the current password is verified server-side with
//     the ANON client. The mobile app never receives, and this function never returns, a
//     service-role key or any session it creates while checking.
//   * Admin/support identities are refused (403). They are removed by operations.
//   * An unreadable or absent profile is refused before anything destructive runs: the role gate
//     fails closed rather than degrading open on a failed read.
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

import { handleDeleteAccount } from './handler.ts';
import type { AdminClient, CallerClient, Deps, VerifierClient } from './handler.ts';

const AUTH_OPTS = { auth: { persistSession: false, autoRefreshToken: false } } as const;

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req: Request) => {
  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const deps: Deps = {
      caller: (authHeader: string) =>
        createClient(supabaseUrl, anonKey, {
          global: { headers: { Authorization: authHeader } },
          ...AUTH_OPTS,
        }) as unknown as CallerClient,
      admin: createClient(supabaseUrl, serviceKey, AUTH_OPTS) as unknown as AdminClient,
      verifier: () => createClient(supabaseUrl, anonKey, AUTH_OPTS) as unknown as VerifierClient,
    };

    const { status, body } = await handleDeleteAccount(
      {
        method: req.method,
        authHeader: req.headers.get('Authorization'),
        json: () => req.json(),
      },
      deps,
    );
    return json(body, status);
  } catch {
    // Deliberately no detail: nothing about the request may reach the logs.
    return json({ ok: false, error: 'Unexpected error.' }, 500);
  }
});
