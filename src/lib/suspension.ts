// suspension.ts — admin: suspend or lift a customer or provider, and read the latest suspension (F5.6b).
//
// Suspend, lift and "retry the sign-in block" go through the Edge Function `admin-account-suspension`, which runs the
// database step with the admin's own session and then blocks (or unblocks) sign-in. Reading uses the admin's own
// row-level security (0069: active admins only). Used by the admin web only.
import { supabase } from '@/lib/supabase';

/** pending: the sign-in block (or unblock) is not confirmed yet · failed: it could not be applied. */
export type SignInBlockState = 'pending' | 'banned' | 'failed' | 'unbanned';

export type SuspensionRecord = {
  id: string;
  reason: string;
  suspended_at: string;
  lifted_at: string | null;
  lift_note: string | null;
  auth_ban_state: SignInBlockState;
};

export type SuspensionOutcome =
  | { ok: true; signInBlock: 'banned' | 'unbanned' | 'failed'; recorded: boolean }
  | { ok: false; error: string };

/** The latest suspension of a person (active or lifted), or null if they were never suspended. */
export async function getLatestSuspension(
  userId: string,
): Promise<{ ok: true; suspension: SuspensionRecord | null } | { ok: false }> {
  try {
    const { data, error } = await supabase
      .from('account_suspensions')
      .select('id, reason, suspended_at, lifted_at, lift_note, auth_ban_state')
      .eq('user_id', userId)
      .order('suspended_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) return { ok: false };
    return { ok: true, suspension: (data as SuspensionRecord | null) ?? null };
  } catch {
    return { ok: false };
  }
}

/** Plain-language messages for the codes the Edge Function returns. */
const ERROR_COPY: Record<string, string> = {
  not_allowed: 'Only an active admin can do this.',
  user_not_found: 'This account no longer exists.',
  user_not_suspendable: 'Only customers and providers can be suspended.',
  user_deleted: 'This account has been deleted.',
  already_suspended: 'This account is already suspended.',
  not_suspended: 'This account is not suspended.',
  no_suspension: 'This account has never been suspended.',
  invalid_reason: 'Enter a reason (up to 500 characters).',
  invalid_note: 'The note can be up to 500 characters.',
};
const GENERIC = 'Could not complete the request. Please try again.';

async function readErrorBody(error: unknown): Promise<unknown> {
  const ctx = (error as { context?: unknown } | null)?.context;
  if (ctx && typeof (ctx as { json?: unknown }).json === 'function') {
    try {
      return await (ctx as { json: () => Promise<unknown> }).json();
    } catch {
      return null;
    }
  }
  return null;
}

async function callSuspensionFunction(body: Record<string, unknown>): Promise<SuspensionOutcome> {
  try {
    const { data, error } = await supabase.functions.invoke('admin-account-suspension', { body });
    // supabase-js surfaces a non-2xx answer as `error`, with the body on `error.context`.
    const payload = (data ?? (await readErrorBody(error))) as
      | { ok?: unknown; error?: unknown; ban_state?: unknown; ban_state_recorded?: unknown }
      | null;
    if (payload?.ok === true && (payload.ban_state === 'banned' || payload.ban_state === 'unbanned' || payload.ban_state === 'failed')) {
      return { ok: true, signInBlock: payload.ban_state, recorded: payload.ban_state_recorded === true };
    }
    const code = typeof payload?.error === 'string' ? payload.error : '';
    return { ok: false, error: ERROR_COPY[code] ?? GENERIC };
  } catch {
    return { ok: false, error: GENERIC };
  }
}

/** Suspends a customer or provider. The reason is required (1–500 characters). */
export function suspendAccount(input: { userId: string; reason: string; reportId?: string | null }) {
  return callSuspensionFunction({ action: 'suspend', user_id: input.userId, reason: input.reason, report_id: input.reportId ?? null });
}

/** Lifts a suspension. The note is optional. */
export function liftSuspension(input: { userId: string; note?: string }) {
  return callSuspensionFunction({ action: 'lift', user_id: input.userId, note: input.note ?? '' });
}

/** Applies the sign-in block (or unblock) again after it failed. */
export function retrySignInBlock(userId: string) {
  return callSuspensionFunction({ action: 'retry_ban', user_id: userId });
}
