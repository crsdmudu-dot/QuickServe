// handler.ts — the admin-account-suspension decision flow, free of Deno and of the Supabase SDK (F5.6b).
//
// Same split as delete-account: every decision lives here, behind injected dependencies, so Jest can run the real
// control flow against recording fakes and assert what the function does NOT do. `index.ts` is Deno wiring only.
//
// WHAT IT DOES. The admin web calls it to suspend a customer or provider, to lift a suspension, or to retry the Auth
// ban after a failure. Migration 0069 does the data side (a suspended account is refused everything at once); this
// function adds the Auth side, so no new session can start (suspend) or sign-in works again (lift).
//
// SECURITY MODEL
//   * Browser access: CORS answers only the exact ADMIN_ORIGIN. A browser request from any other origin is refused,
//     and so is every browser request while ADMIN_ORIGIN is unset. There is never a wildcard.
//   * Identity comes only from the verified bearer token. The acting admin is never read from the request body.
//   * The caller must be an active admin (approved, not deleted). The service-role read of their profile fails CLOSED
//     on an error or a missing row, and happens before anything about the target is read or changed.
//   * Suspend and lift run with the ADMIN'S OWN token, so the database checks again (is_active_admin(), auth.uid()).
//   * The service role is used only to read profiles and the latest suspension, to ban or unban the Auth identity,
//     and to record that outcome (set_suspension_ban_state, service role only).
//   * A partial failure fails closed: if the ban cannot be applied, the account is still suspended in the database and
//     the admin is told; if the unban fails, the person stays unable to sign in. The admin can retry.
//   * Nothing is logged: no targets, reasons, notes or tokens.

export type Action = 'suspend' | 'lift' | 'retry_ban';
export type BanState = 'banned' | 'unbanned' | 'failed';

/** ~100 years, as delete-account uses. */
export const BAN_DURATION = '876600h';
/** Supabase Auth's value that removes a ban. */
export const UNBAN = 'none';

export type ProfileRow = { role?: string | null; approval_status?: string | null; deleted_at?: string | null };
export type SuspensionRow = { id: string; lifted_at: string | null };
type Result<T> = { data: T | null; error: unknown };

/** Runs with the caller's own token (the anon key plus their Authorization header). */
export type CallerClient = {
  getUser(): Promise<{ data: { user: { id: string } | null } }>;
  suspend(args: { p_user: string; p_reason: string; p_report: string | null }): PromiseLike<Result<unknown>>;
  lift(args: { p_user: string; p_note: string | null }): PromiseLike<Result<unknown>>;
};

/** The service-role surface this function uses, and nothing else. */
export type ServiceClient = {
  readProfile(uid: string): PromiseLike<Result<ProfileRow>>;
  readLatestSuspension(uid: string): PromiseLike<Result<SuspensionRow>>;
  setBan(uid: string, banDuration: string): Promise<unknown>;
  recordBanState(suspensionId: string, state: BanState): PromiseLike<{ error: unknown }>;
};

export type Deps = {
  caller(authHeader: string): CallerClient;
  service: ServiceClient;
  /** Already parsed with parseAdminOrigin(); null means browsers are refused. */
  adminOrigin: string | null;
};

export type HandlerRequest = {
  method: string;
  origin: string | null;
  authHeader: string | null;
  json(): Promise<unknown>;
};

export type HandlerResult = { status: number; headers: Record<string, string>; body: Record<string, unknown> | null };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const GENERIC_FAILURE = 'Could not complete the request. Please try again.';

/**
 * ADMIN_ORIGIN as configured: an https origin with no path. A single trailing "/" is tolerated. Anything else
 * (unset, http:, a path, a wildcard) gives null, and browsers are then refused.
 */
export function parseAdminOrigin(raw: string | null | undefined): string | null {
  const value = (raw ?? '').trim().replace(/\/$/, '');
  return /^https:\/\/[a-z0-9-]+(\.[a-z0-9-]+)+(:\d{1,5})?$/i.test(value) ? value.toLowerCase() : null;
}

/** The CORS headers for an allowed origin, or null. Only an exact match is allowed. */
export function corsHeaders(origin: string | null, adminOrigin: string | null): Record<string, string> | null {
  if (!adminOrigin || !origin || origin.toLowerCase() !== adminOrigin) return null;
  return {
    'Access-Control-Allow-Origin': adminOrigin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Max-Age': '600',
  };
}

/** Database refusals the admin can act on, mapped to a status and a stable code. Anything else is generic. */
const RPC_REFUSALS: Record<string, { status: number; code: string }> = {
  'Admin only': { status: 403, code: 'not_allowed' },
  user_not_found: { status: 404, code: 'user_not_found' },
  user_not_suspendable: { status: 409, code: 'user_not_suspendable' },
  user_deleted: { status: 409, code: 'user_deleted' },
  already_suspended: { status: 409, code: 'already_suspended' },
  not_suspended: { status: 409, code: 'not_suspended' },
  invalid_reason: { status: 400, code: 'invalid_reason' },
  invalid_note: { status: 400, code: 'invalid_note' },
};

function banFailed(outcome: unknown): boolean {
  const o = outcome as { error?: unknown } | null | undefined;
  return !!o && typeof o === 'object' && o.error != null;
}

export async function handleSuspension(req: HandlerRequest, deps: Deps): Promise<HandlerResult> {
  const cors = corsHeaders(req.origin, deps.adminOrigin);
  const headers: Record<string, string> = { 'Content-Type': 'application/json', Vary: 'Origin', ...(cors ?? {}) };
  const result = (status: number, body: Record<string, unknown> | null): HandlerResult => ({ status, headers, body });

  // ── Browser gate: a request that carries an Origin must come from the admin web exactly ─────────────
  if (req.origin !== null && !cors) return { status: 403, headers: { Vary: 'Origin' }, body: null };
  if (req.method === 'OPTIONS') return result(204, null);
  if (req.method !== 'POST') return result(405, { ok: false, error: 'Method not allowed.' });

  try {
    const authHeader = req.authHeader ?? '';
    if (!authHeader.toLowerCase().startsWith('bearer ')) return result(401, { ok: false, error: 'Unauthorized.' });

    // ── The request: only these fields are read; nothing names the acting admin ──────────────────────
    let body: { action?: unknown; user_id?: unknown; reason?: unknown; note?: unknown; report_id?: unknown };
    try {
      body = ((await req.json()) ?? {}) as typeof body;
    } catch {
      return result(400, { ok: false, error: 'invalid_request' });
    }
    const action = body.action;
    if (action !== 'suspend' && action !== 'lift' && action !== 'retry_ban') {
      return result(400, { ok: false, error: 'invalid_request' });
    }
    const target = typeof body.user_id === 'string' && UUID.test(body.user_id) ? body.user_id.toLowerCase() : null;
    if (!target) return result(400, { ok: false, error: 'invalid_request' });
    const reason = typeof body.reason === 'string' ? body.reason.trim() : '';
    if (action === 'suspend' && (reason.length < 1 || reason.length > 500)) {
      return result(400, { ok: false, error: 'invalid_reason' });
    }
    const noteText = typeof body.note === 'string' ? body.note.trim() : '';
    if (noteText.length > 500) return result(400, { ok: false, error: 'invalid_note' });
    const note = noteText === '' ? null : noteText;
    let report: string | null = null;
    if (body.report_id !== undefined && body.report_id !== null) {
      if (typeof body.report_id !== 'string' || !UUID.test(body.report_id)) {
        return result(400, { ok: false, error: 'invalid_request' });
      }
      report = body.report_id.toLowerCase();
    }

    // ── Identity: from the token, never from the body ────────────────────────────────────────────────
    const caller = deps.caller(authHeader);
    const {
      data: { user },
    } = await caller.getUser();
    if (!user) return result(401, { ok: false, error: 'Unauthorized.' });

    // ── Admin gate: fail CLOSED, before anything about the target is read or changed ────────────────
    const { data: me, error: meError } = await deps.service.readProfile(user.id);
    if (meError) return result(500, { ok: false, error: GENERIC_FAILURE });
    if (!me || me.role !== 'admin' || me.approval_status !== 'approved' || me.deleted_at) {
      return result(403, { ok: false, error: 'not_allowed' });
    }

    // ── The target must exist ────────────────────────────────────────────────────────────────────────
    const { data: person, error: personError } = await deps.service.readProfile(target);
    if (personError) return result(500, { ok: false, error: GENERIC_FAILURE });
    if (!person) return result(404, { ok: false, error: 'user_not_found' });

    // ── The database step (suspend and lift run with the admin's own token) ─────────────────────────
    let suspensionId: string;
    let wantBan: boolean;
    if (action === 'retry_ban') {
      const { data: latest, error: latestError } = await deps.service.readLatestSuspension(target);
      if (latestError) return result(500, { ok: false, error: GENERIC_FAILURE });
      if (!latest) return result(409, { ok: false, error: 'no_suspension' });
      suspensionId = latest.id;
      wantBan = latest.lifted_at === null;
    } else {
      // A deleted account's Auth identity must never be unbanned by a lift.
      if (action === 'lift' && person.deleted_at) return result(409, { ok: false, error: 'user_deleted' });
      const { data, error } =
        action === 'suspend'
          ? await caller.suspend({ p_user: target, p_reason: reason, p_report: report })
          : await caller.lift({ p_user: target, p_note: note });
      if (error) {
        const message = (error as { message?: unknown }).message;
        const known = typeof message === 'string' ? RPC_REFUSALS[message] : undefined;
        return known ? result(known.status, { ok: false, error: known.code }) : result(500, { ok: false, error: GENERIC_FAILURE });
      }
      if (typeof data !== 'string' || !UUID.test(data)) return result(500, { ok: false, error: GENERIC_FAILURE });
      suspensionId = data;
      wantBan = action === 'suspend';
    }
    if (!wantBan && person.deleted_at) return result(409, { ok: false, error: 'user_deleted' });

    // ── The Auth step, then record its outcome. Failures are reported, never hidden ─────────────────
    let state: BanState;
    try {
      const outcome = await deps.service.setBan(target, wantBan ? BAN_DURATION : UNBAN);
      state = banFailed(outcome) ? 'failed' : wantBan ? 'banned' : 'unbanned';
    } catch {
      state = 'failed';
    }
    let recorded = false;
    try {
      const { error: recordError } = await deps.service.recordBanState(suspensionId, state);
      recorded = !recordError;
    } catch {
      recorded = false;
    }
    return result(200, { ok: true, action, suspension_id: suspensionId, ban_state: state, ban_state_recorded: recorded });
  } catch {
    // Deliberately no detail: nothing about the request may reach the logs or the caller.
    return result(500, { ok: false, error: 'Unexpected error.' });
  }
}
