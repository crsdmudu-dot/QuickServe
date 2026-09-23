// handler.ts — the deletion-worker control flow, free of Deno and of the Supabase SDK.
//
// The worker finishes what `delete-account` starts: it removes the person's uploaded objects,
// retries the auth-identity deletion the Edge Function could not complete, and settles the
// cleanup state so the account can be reported truthfully. Every decision is here, behind
// injected dependencies, so the real control flow runs in Jest against recording fakes.
//
// CONTRACT WITH THE DATABASE (migration 0059). The database is the arbiter:
//   claim_deletion_work     leases eligible intents (planned / destroying / object_removed /
//                           object_absent), FOR UPDATE SKIP LOCKED, backoff respected.
//   authorize_destroy       the DESTRUCTIVE AUTHORISATION BOUNDARY. Commits 'destroying' only when
//                           the lease is live, no hold covers the object, the object exists and
//                           its id is the inventoried one. Returns {authorized, reason}.
//   record_destroy_result   given what the Storage API reported, reads storage.objects and
//                           decides: removed / absent / ambiguous (retry) / permission /
//                           identity_mismatch (operator).
//   finish_intent           deletes the metadata row, verifies object and row are gone.
//   claim_auth_work         leases accounts whose auth identity still needs removing (including
//                           'not_started' ones the Edge Function never finished).
//   record_auth_result      deleted / transient / dependency / permission.
//   list_cleanup_candidates, try_complete_cleanup
//                           settle cleanup after the window, one more sweep, honest final state.
//
// WHAT THE LEASE FENCES. Every database transition carries the lease id and the database checks
// it; a stale worker's write updates zero rows. The lease does NOT fence the Storage API: that
// call is unconditional by path. So this handler never calls Storage unless its OWN
// authorize_destroy just returned authorized=true (a fresh, fenced transition), and it never
// concludes anything from the Storage response: the database re-reads storage.objects.
//
// Nothing personal is logged. The summary carries counts and reason classes only.

export type RpcResult = { data: unknown; error: unknown };

export type WorkerDb = {
  rpc(fn: string, args: Record<string, unknown>): PromiseLike<RpcResult>;
};

export type StorageRemoveResult = { status: number; items: number; error?: string };

export type AuthDeleteError = { status?: number; message?: string } | null;

export type WorkerDeps = {
  db: WorkerDb;
  storage: { remove(bucket: string, path: string): Promise<StorageRemoveResult> };
  auth: {
    ban(uid: string): Promise<unknown>;
    deleteUser(uid: string): Promise<{ error: AuthDeleteError }>;
  };
  /** The shared secret the caller must present; null means the worker is disabled. */
  expectedSecret: string | null;
  /** Clock, injectable for tests. */
  now?: () => number;
};

export type WorkerRequest = {
  method: string;
  secretHeader: string | null;
  json(): Promise<unknown>;
};

export type ClaimedIntent = {
  intent_id: string;
  lease_id: string;
  /** ISO timestamp from the database; the worker will not call Storage without enough lease left. */
  leased_until?: string | null;
  state: string;
  bucket_id: string;
  object_path: string;
  attempts?: number;
};

export type ClaimedAccount = {
  deletion_id: string;
  user_id: string;
  lease_id: string;
  attempts?: number;
};

export type StorageResultClass = 'api_ok_item' | 'api_ok_empty' | 'api_permission' | 'api_transient';
export type AuthResultClass = 'deleted' | 'transient' | 'dependency' | 'permission';

export type WorkerSummary = {
  ok: true;
  intents: Record<string, number>;
  auth: Record<string, number>;
  cleanup: Record<string, number>;
};

export type HandlerResult = { status: number; body: Record<string, unknown> };

export const BAN_DURATION = '876600h';
export const DEFAULT_LIMIT = 25;
export const MAX_LIMIT = 100;
/** The Storage delete is aborted after this long (index.ts applies it to the storage client). */
export const STORAGE_TIMEOUT_MS = 30_000;
/**
 * The worker calls Storage only if at least this much lease remains: the call's own timeout plus
 * a margin. With a 10-minute lease this means a delete can never be in flight after the lease
 * has expired and another worker may have resumed the intent.
 */
export const LEASE_BUDGET_MS = STORAGE_TIMEOUT_MS + 60_000;

/** True when the lease still has more than the Storage budget left; false if unknown. */
export function leaseAllowsStorageCall(leasedUntil: string | null | undefined, nowMs: number): boolean {
  if (!leasedUntil) return false;
  const until = Date.parse(leasedUntil);
  if (!Number.isFinite(until)) return false;
  return until - nowMs > LEASE_BUDGET_MS;
}

/** 200 with an item = removed; 200 with none = "missing / not permitted / already gone" (indistinguishable, verified on QA); 401/403 = permission; anything else = transient. */
export function classifyStorageResult(r: StorageRemoveResult): StorageResultClass {
  if (r.status === 200) return r.items > 0 ? 'api_ok_item' : 'api_ok_empty';
  if (r.status === 401 || r.status === 403) return 'api_permission';
  return 'api_transient';
}

/** An identity that is already gone counts as deleted; a dependency refusal is retried after cleanup has had time to run. */
export function classifyAuthError(err: AuthDeleteError): AuthResultClass {
  if (!err) return 'deleted';
  const msg = (err.message ?? '').toLowerCase();
  if (err.status === 404 || /not found|does not exist/.test(msg)) return 'deleted';
  if (err.status === 401 || err.status === 403) return 'permission';
  if (/foreign key|violates|constraint|referenc|depend/.test(msg)) return 'dependency';
  return 'transient';
}

function secretMatches(expected: string | null, presented: string | null): boolean {
  if (!expected || !presented) return false;
  if (expected.length !== presented.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i += 1) {
    diff |= expected.charCodeAt(i) ^ presented.charCodeAt(i);
  }
  return diff === 0;
}

function bump(counter: Record<string, number>, key: string): void {
  counter[key] = (counter[key] ?? 0) + 1;
}

function result(body: Record<string, unknown>, status = 200): HandlerResult {
  return { status, body };
}

async function rpc(db: WorkerDb, fn: string, args: Record<string, unknown>): Promise<unknown> {
  const { data, error } = await db.rpc(fn, args);
  if (error) throw new Error(`rpc ${fn} failed`);
  return data;
}

export async function runDeletionWorker(
  req: WorkerRequest,
  deps: WorkerDeps,
): Promise<HandlerResult> {
  if (req.method !== 'POST') return result({ ok: false, error: 'Method not allowed.' }, 405);
  if (!secretMatches(deps.expectedSecret, req.secretHeader)) {
    return result({ ok: false, error: 'Unauthorized.' }, 401);
  }

  let limit = DEFAULT_LIMIT;
  try {
    const body = ((await req.json()) ?? {}) as { limit?: unknown };
    if (typeof body.limit === 'number' && Number.isFinite(body.limit)) {
      limit = Math.max(1, Math.min(MAX_LIMIT, Math.floor(body.limit)));
    }
  } catch {
    // An empty or malformed body means "defaults"; the tick sends {limit}.
  }

  const summary: WorkerSummary = { ok: true, intents: {}, auth: {}, cleanup: {} };
  const db = deps.db;

  try {
    // ── 1. Photo intents ─────────────────────────────────────────────────────────────────
    const claimed = ((await rpc(db, 'claim_deletion_work', { p_limit: limit })) ?? []) as ClaimedIntent[];
    for (const intent of claimed) {
      const args = { p_intent: intent.intent_id, p_lease: intent.lease_id };

      if (intent.state === 'planned' || intent.state === 'destroying') {
        // Budget check BEFORE authorising: authorising with too little lease left would only
        // hand the intent to the next worker in 'destroying'; leave it 'planned' instead.
        if (!leaseAllowsStorageCall(intent.leased_until, (deps.now ?? Date.now)())) {
          bump(summary.intents, 'skipped:lease_budget');
          continue;
        }
        const auth = (await rpc(db, 'authorize_destroy', args)) as
          | { authorized?: boolean; reason?: string }
          | null;
        if (!auth?.authorized) {
          const reason = auth?.reason ?? 'unknown';
          bump(summary.intents, `not_authorized:${reason}`);
          if (reason === 'absent') await finish(db, args, summary);
          continue;
        }

        // The ONLY place Storage is called: immediately after our own fenced authorisation, and
        // only while the lease has more than the call's own timeout left. Otherwise leave the
        // intent 'destroying' for whichever worker holds a live lease next; nothing was destroyed.
        if (!leaseAllowsStorageCall(intent.leased_until, (deps.now ?? Date.now)())) {
          bump(summary.intents, 'skipped:lease_budget');
          continue;
        }
        let storageResult: StorageRemoveResult;
        try {
          storageResult = await deps.storage.remove(intent.bucket_id, intent.object_path);
        } catch {
          storageResult = { status: 0, items: 0, error: 'transport' };
        }
        const cls = classifyStorageResult(storageResult);
        const recorded = (await rpc(db, 'record_destroy_result', {
          ...args,
          p_result: cls,
          p_detail: `${cls} status=${storageResult.status}`,
        })) as { recorded?: boolean; state?: string } | null;
        bump(summary.intents, `destroy:${cls}->${recorded?.state ?? 'unrecorded'}`);
        if (recorded?.state === 'object_removed' || recorded?.state === 'object_absent') {
          await finish(db, args, summary);
        }
        continue;
      }

      if (intent.state === 'object_removed' || intent.state === 'object_absent') {
        await finish(db, args, summary);
        continue;
      }
      bump(summary.intents, `skipped:${intent.state}`);
    }

    // ── 2. Cleanup settlement (after the window, with one more sweep) ────────────────────
    const candidates = ((await rpc(db, 'list_cleanup_candidates', { p_limit: limit })) ?? []) as
      | { deletion_id: string }[];
    for (const c of candidates) {
      const r = (await rpc(db, 'try_complete_cleanup', { p_deletion: c.deletion_id })) as
        | { complete?: boolean; reason?: string; cleanup_state?: string }
        | null;
      bump(summary.cleanup, r?.complete ? `complete:${r.cleanup_state}` : `pending:${r?.reason ?? r?.cleanup_state ?? 'unknown'}`);
    }

    // ── 3. Auth identity recovery (after cleanup has had its turn) ───────────────────────
    const accounts = ((await rpc(db, 'claim_auth_work', { p_limit: Math.min(limit, 10) })) ?? []) as
      | ClaimedAccount[];
    for (const a of accounts) {
      await deps.auth.ban(a.user_id).catch(() => {});
      let cls: AuthResultClass;
      let detail: string;
      try {
        const { error } = await deps.auth.deleteUser(a.user_id);
        cls = classifyAuthError(error);
        detail = error ? `status=${error.status ?? 'n/a'}` : 'ok';
      } catch {
        cls = 'transient';
        detail = 'transport';
      }
      const r = (await rpc(db, 'record_auth_result', {
        p_deletion: a.deletion_id,
        p_lease: a.lease_id,
        p_result: cls,
        p_detail: detail,
      })) as { recorded?: boolean; auth_state?: string } | null;
      bump(summary.auth, `${cls}->${r?.auth_state ?? 'unrecorded'}`);
    }

    return result(summary);
  } catch {
    // Deliberately no detail: nothing about the data may reach the logs. Partial progress is
    // already durable in the database; the next run resumes from it.
    return result({ ok: false, error: 'Worker run failed.', partial: summary }, 500);
  }
}

async function finish(
  db: WorkerDb,
  args: { p_intent: string; p_lease: string },
  summary: WorkerSummary,
): Promise<void> {
  const r = (await rpc(db, 'finish_intent', args)) as
    | { verified?: boolean; outcome?: string; reason?: string }
    | null;
  bump(summary.intents, r?.verified ? `verified:${r.outcome ?? 'unknown'}` : `unverified:${r?.reason ?? 'unknown'}`);
}
