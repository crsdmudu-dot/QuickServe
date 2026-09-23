// deletion-worker — finishes account deletions: removes the person's uploaded objects, retries
// the auth-identity deletion, settles the cleanup state.
//
// This file is the Deno EDGE: environment, client construction, Request/Response. Every decision
// lives in `./handler.ts`, which imports nothing and is exercised in Jest. Keep it that way.
//
// INVOCATION. Not user-facing. It is called by `public.deletion_worker_tick()` (pg_cron +
// pg_net, disabled until an operator configures `private.deletion_worker_config`) or by an
// operator. The caller presents the shared secret in the `x-worker-secret` header; the function
// compares it to `DELETION_WORKER_SECRET` from the function's own secrets. No user JWT is
// involved, so the worker keeps working after the identity is gone.
//
// GATEWAY. `supabase/config.toml` sets `verify_jwt = false` for THIS function only (the tick
// carries no JWT). The handler's secret check is therefore the only authentication and it fails
// closed: no configured secret, no header, or a wrong header → 401 before any database call.
//
// ACCESS TO STORAGE. The worker never reads the storage schema. Every fact about an object
// (present? which id?) comes from service-only SQL routines (0059) that return only what the
// decision needs. The only Storage API call is the delete, made with the service key.
import { createClient } from 'jsr:@supabase/supabase-js@2';

import { BAN_DURATION, STORAGE_TIMEOUT_MS, runDeletionWorker } from './handler.ts';
import type { WorkerDeps } from './handler.ts';

const AUTH_OPTS = { auth: { persistSession: false, autoRefreshToken: false } } as const;

/** The routines are dynamic (`rpc(fn)`), so the schema names no table. */
type WorkerDatabase = {
  public: {
    Tables: Record<string, never>;
    Views: Record<string, never>;
    Functions: { [name: string]: { Args: Record<string, unknown>; Returns: unknown } };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function statusOf(error: unknown): number {
  const e = error as { status?: unknown; statusCode?: unknown } | null;
  if (typeof e?.status === 'number') return e.status;
  const code = Number(e?.statusCode);
  return Number.isFinite(code) && code > 0 ? code : 0;
}

Deno.serve(async (req: Request) => {
  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const expectedSecret = Deno.env.get('DELETION_WORKER_SECRET') ?? null;

    const service = createClient<WorkerDatabase>(supabaseUrl, serviceKey, AUTH_OPTS);
    // A separate client for the one destructive call, with a hard timeout shorter than the lease
    // budget the handler enforces (see LEASE_BUDGET_MS). A hung delete is aborted, never left in
    // flight past the lease.
    const storageService = createClient<WorkerDatabase>(supabaseUrl, serviceKey, {
      ...AUTH_OPTS,
      global: {
        fetch: (input: RequestInfo | URL, init?: RequestInit) =>
          fetch(input, { ...init, signal: AbortSignal.timeout(STORAGE_TIMEOUT_MS) }),
      },
    });

    const deps: WorkerDeps = {
      db: { rpc: (fn, args) => service.rpc(fn, args) },
      storage: {
        remove: async (bucket, path) => {
          const { data, error } = await storageService.storage.from(bucket).remove([path]);
          if (error) return { status: statusOf(error), items: 0, error: 'storage_error' };
          return { status: 200, items: Array.isArray(data) ? data.length : 0 };
        },
      },
      auth: {
        ban: (uid) => service.auth.admin.updateUserById(uid, { ban_duration: BAN_DURATION }),
        deleteUser: async (uid) => {
          const { error } = await service.auth.admin.deleteUser(uid);
          return {
            error: error
              ? { status: (error as { status?: number }).status, message: error.message }
              : null,
          };
        },
      },
      expectedSecret,
    };

    const { status, body } = await runDeletionWorker(
      {
        method: req.method,
        secretHeader: req.headers.get('x-worker-secret'),
        json: () => req.json(),
      },
      deps,
    );
    return json(body, status);
  } catch {
    // Deliberately no detail.
    return json({ ok: false, error: 'Unexpected error.' }, 500);
  }
});
